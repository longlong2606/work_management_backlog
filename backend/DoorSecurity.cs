using System.Data;
using System.Security.Cryptography;
using System.Text;
using Dapper;

namespace WorkManagement.Api;

// [BẢO MẬT] Xác thực thiết bị khóa cửa: chữ ký HMAC từng lần gọi + số đếm chống chép lại.
public static class DoorSecurity
{
    static readonly object ctrGate = new();

    // Yêu cầu qua tunnel Cloudflare luôn có header này; khóa trong lab thì không.
    public static bool IsFromInternet(HttpContext ctx) => ctx.Request.Headers.ContainsKey("Cf-Connecting-IP");

    public static string ClientIp(HttpContext ctx) =>
        ctx.Request.Headers.TryGetValue("Cf-Connecting-IP", out var ip)
            ? ip.ToString().Trim()
            : ctx.Connection.RemoteIpAddress?.ToString() ?? "";

    public static string GetOrCreateSecret(IDbConnection conn)
    {
        var s = conn.QueryFirstOrDefault<string>("SELECT value FROM system_settings WHERE key = 'door_hmac_secret'");
        if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
        s = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        conn.Execute("INSERT INTO system_settings (key, value) VALUES ('door_hmac_secret', @v) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", new { v = s });
        return s;
    }

    public static string Sign(string secretHex, string message) =>
        Convert.ToHexString(HMACSHA256.HashData(Convert.FromHexString(secretHex), Encoding.UTF8.GetBytes(message))).ToLowerInvariant();

    static string? Setting(IDbConnection conn, string key) =>
        conn.QueryFirstOrDefault<string>("SELECT value FROM system_settings WHERE key = @k", new { k = key });

    // [BẢO MẬT] Chặn đăng nhập sai: 5 lần sai trong 15 phút (trượt) thì chặn IP đó. Bộ đếm trong RAM.
    static readonly System.Collections.Concurrent.ConcurrentDictionary<string, List<DateTime>> loginFails = new();

    public static bool LoginBlocked(string ip)
    {
        if (!loginFails.TryGetValue(ip, out var list)) return false;
        lock (list)
        {
            list.RemoveAll(t => t < DateTime.UtcNow.AddMinutes(-15));
            return list.Count >= 5;
        }
    }

    public static void LoginFailed(string ip)
    {
        var list = loginFails.GetOrAdd(ip, _ => new List<DateTime>());
        lock (list) list.Add(DateTime.UtcNow);
    }

    public static void LoginSucceeded(string ip) => loginFails.TryRemove(ip, out _);

    // Trả ctr (>0) nếu chữ ký hợp lệ và ctr mới hơn lần trước; null nếu sai. Mã cũ key= đã bỏ hẳn.
    public static long? VerifyDevice(HttpContext ctx)
    {
        if (IsFromInternet(ctx)) return null;
        using var conn = Database.GetConnection();
        var sig = ctx.Request.Query["sig"].FirstOrDefault();
        var ctrStr = ctx.Request.Query["ctr"].FirstOrDefault();

        if (!string.IsNullOrEmpty(sig))
        {
            if (!long.TryParse(ctrStr, out var ctr) || ctr <= 0) return null;
            // Tin ký = query thô đứng trước "&sig=" (không giải mã lại, khớp đúng với khóa ký)
            var raw = (ctx.Request.QueryString.Value ?? "").TrimStart('?');
            int cut = raw.IndexOf("&sig=", StringComparison.Ordinal);
            if (cut < 0) return null;
            var expect = Sign(GetOrCreateSecret(conn), raw[..cut]);
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expect), Encoding.UTF8.GetBytes(sig.ToLowerInvariant())))
                return null;
            // Mốc riêng từng thiết bị: "dev" nằm trong phần đã ký nên không giả được. Không có dev = khóa thật.
            // (Trước đây dùng chung 1 mốc với test: test lỗi giữa chừng để lại mốc lớn là khóa bị chặn.)
            var dev = ctx.Request.Query["dev"].FirstOrDefault();
            var ctrKey = "door_ctr:" + (string.IsNullOrWhiteSpace(dev) ? "lock" : dev.Trim());
            lock (ctrGate)
            {
                var last = long.TryParse(Setting(conn, ctrKey), out var l) ? l : 0;
                if (ctr <= last) return null;   // chép lại gói cũ
                conn.Execute("INSERT INTO system_settings (key, value) VALUES (@k, @v) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", new { k = ctrKey, v = ctr.ToString() });
            }
            ctx.Items["door_ctr"] = ctr;
            return ctr;
        }

        return null;
    }

    // Trả lời 2xx cho yêu cầu đã ký được gắn X-Sig = HMAC("<ctr>|<nội dung>") để khóa kiểm trước khi ghi.
    public static void UseDeviceResponseSigning(WebApplication app)
    {
        // Tạo bí mật sau khi DB đã sẵn sàng, để admin/test đọc được
        app.Lifetime.ApplicationStarted.Register(() =>
        {
            try
            {
                using var c = Database.GetConnection();
                GetOrCreateSecret(c);
                c.Execute("DELETE FROM system_settings WHERE key IN ('door_last_ctr', 'door_legacy_key', 'door_secret_key')");   // mốc/mã cũ, không dùng nữa
            }
            catch (Exception ex) { Console.WriteLine("[BẢO MẬT] không tạo được bí mật HMAC: " + ex.Message); }
        });
        app.Use(async (ctx, next) =>
        {
            if (!ctx.Request.Query.ContainsKey("sig")) { await next(); return; }   // chỉ đệm trả lời cho lệnh đã ký
            var real = ctx.Response.Body;
            using var buf = new MemoryStream();
            ctx.Response.Body = buf;
            try { await next(); }
            finally { ctx.Response.Body = real; }

            if (ctx.Items.TryGetValue("door_ctr", out var c) && ctx.Response.StatusCode is >= 200 and < 300)
            {
                buf.Position = 0;
                var body = await new StreamReader(buf, Encoding.UTF8, leaveOpen: true).ReadToEndAsync();
                using var conn = Database.GetConnection();
                ctx.Response.Headers["X-Sig"] = Sign(GetOrCreateSecret(conn), $"{c}|{body}");
            }
            buf.Position = 0;
            await buf.CopyToAsync(real);
        });
    }
}
