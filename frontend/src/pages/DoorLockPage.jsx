// [ESP-LOCK] Trang Khóa cửa lab (ESP8266 + PN532), viết lại cho người dùng:
// chỉ gồm thẻ (thêm / đổi tên / tạm khóa / xóa), lịch sử ra vào và phiên quản lý thẻ.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  DoorOpen,
  Lock,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldX,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { Combobox } from "@base-ui/react/combobox";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import "./DoorLockPage.css";

// ---------- Tiện ích hiển thị ----------
const compactUid = (uid) => (uid || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
const prettyUid = (uid) => compactUid(uid).replace(/(..)(?=.)/g, "$1 ");
// Tên tạm khóa tự đặt khi thêm bằng thẻ Master: "The moi 19/11 14:05"
const isTempName = (name) => !name || /^th[eẻ] m[oớ]i\b/i.test(name.trim());
// Loại người dùng thẻ: Nhân sự (gắn với tài khoản) hoặc Bảo vệ / Khách (chỉ có tên, không có trong Nhân sự)
const TYPE_LABEL = { staff: "Nhân sự", guard: "Bảo vệ", guest: "Khách" };
const isExternal = (c) => c.card_type === "guard" || c.card_type === "guest";
const holderLabel = (c) => (isExternal(c) ? `${c.card_holder || ""} (${TYPE_LABEL[c.card_type]})` : c.card_holder || "");
const initials = (name) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// [LỌC NGÀY] khoảng ngày xem lịch sử: Hôm nay / 7 ngày / Tháng này / tự chọn (from, to dạng yyyy-MM-dd)
const LOG_PAGE = 500; // mỗi lần lấy tối đa 500 lượt, còn nữa thì "Tải thêm"
function presetRange(preset) {
  const now = new Date();
  const to = dayKey(now);
  if (preset === "today") return { preset, from: to, to };
  if (preset === "month") return { preset, from: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  const d = new Date(now);
  d.setDate(d.getDate() - 6);
  return { preset: "7d", from: dayKey(d), to };
}
const parseLocal = (s) => {
  // "yyyy-MM-dd HH:mm:ss" (giờ Việt Nam do server ghi)
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
};
const dayLabel = (d) => {
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Hôm nay";
  if (dayKey(d) === dayKey(yest)) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
};

// Phân loại một dòng lịch sử
function classifyLog(log) {
  if (log.card_uid === "EXIT" || log.action === "exit") return { kind: "out", label: "Ra", who: "Mở từ bên trong" };
  if (log.card_uid === "ADMIN_REMOTE") return { kind: "in", label: "Mở", who: `Mở từ web · ${log.card_holder || "quản trị"}` };
  if (log.status === "granted") return { kind: "in", label: "Vào", who: log.card_holder || "Chưa đặt tên" };
  return { kind: "denied", label: "Từ chối", who: log.card_holder || "Thẻ lạ" };
}

// ---------- Hộp thoại (Base UI: giữ focus, Esc để đóng; xóa/thay thẻ dùng AlertDialog) ----------
function Modal({ open, onClose, title, children, alert = false }) {
  const Comp = alert ? AlertDialog : Dialog;
  const popupRef = useRef(null);
  return (
    <Comp.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Comp.Portal>
        <Comp.Backdrop className="dl-backdrop" />
        <Comp.Popup
          ref={popupRef}
          className="dl-dialog"
          initialFocus={() => popupRef.current?.querySelector("[data-autofocus]") ?? true}
        >
          <div className="dl-dialog-head">
            <Comp.Title className="dl-dialog-title">{title}</Comp.Title>
            <Comp.Close className="dl-icon-btn" aria-label="Đóng">
              <X size={18} />
            </Comp.Close>
          </div>
          {children}
        </Comp.Popup>
      </Comp.Portal>
    </Comp.Root>
  );
}

// ---------- Ô chọn người trong Nhân sự (thả xuống + tìm kiếm) ----------
const fold = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

function PersonPicker({ users, cards, value, onChange, currentUid = "", autoFocus = false, label = "Người dùng thẻ" }) {
  // Thẻ đang gắn với từng người (bỏ qua chính thẻ đang sửa)
  const cardOf = useMemo(() => {
    const m = {};
    cards.forEach((c) => {
      if (c.user_id && compactUid(c.card_uid) !== compactUid(currentUid)) m[c.user_id] = c.card_uid;
    });
    return m;
  }, [cards, currentUid]);

  return (
    <Combobox.Root
      items={users}
      value={value}
      onValueChange={(u) => onChange(u ?? null)}
      itemToStringLabel={(u) => u?.full_name || u?.username || ""}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
      filter={(u, q) => fold(`${u.full_name} ${u.username} ${u.phone || ""}`).includes(fold(q).trim())}
    >
      <div className="dl-picker">
        <Combobox.Input
          className="dl-picker-input"
          placeholder="Tìm tên, tên đăng nhập, số điện thoại"
          aria-label={label}
          data-autofocus={autoFocus ? "" : undefined}
        />
        <Combobox.Trigger className="dl-picker-trigger" aria-label="Mở danh sách người">
          <ChevronDown size={16} />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="dl-picker-positioner" sideOffset={4}>
          <Combobox.Popup className="dl-picker-popup">
            <Combobox.Empty className="dl-picker-empty">
              Không có ai khớp. Người mới cần được tạo ở trang Nhân sự trước.
            </Combobox.Empty>
            <Combobox.List className="dl-picker-list">
              {(u) => (
                <Combobox.Item key={u.id} value={u} className="dl-picker-item">
                  <span className="dl-avatar dl-avatar--sm" aria-hidden="true">{initials(u.full_name || u.username)}</span>
                  <span className="dl-picker-text">
                    <span className="dl-person-name">{u.full_name || u.username}</span>
                    <span className="dl-uid">
                      @{u.username}
                      {cardOf[u.id] && <span className="dl-picker-has"> · đã có thẻ {prettyUid(cardOf[u.id])}</span>}
                    </span>
                  </span>
                  <Combobox.ItemIndicator className="dl-picker-check">
                    <Check size={16} />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

// ---------- Trang ----------
export function DoorLockPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin";   // [BẢO MẬT] chỉ admin (leader không còn quyền)

  const [tab, setTab] = useState("cards"); // cards | history
  const [cards, setCards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [logFilter, setLogFilter] = useState("all"); // all | in | out | denied
  // [LỌC NGÀY] lịch sử lấy theo khoảng ngày từ máy chủ; số liệu "hôm nay" lấy riêng
  const [range, setRange] = useState(() => presetRange("7d"));
  const [todayLogs, setTodayLogs] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQ, setSearchQ] = useState(""); // ô tìm kiếm, chờ ngừng gõ 300 ms rồi mới hỏi máy chủ

  // [1 NÚT] Chế độ quản lý thẻ trên web: bấm "Quản lý thẻ" mới hiện thêm / đổi người / tạm khóa / xóa.
  // Khóa tự lấy danh sách mới ở lần thức dậy tiếp theo (không còn giữ nút 2 giây + Đồng ý / Lưu).
  const [manage, setManage] = useState(false);

  // Nhân sự: thẻ chỉ được gắn cho người có trong danh sách này (1 người 1 thẻ)
  const [users, setUsers] = useState([]);

  // Hộp thoại
  const [editing, setEditing] = useState(null); // null | {mode:'add'|'edit', card?}
  const [form, setForm] = useState({ uid: "", type: "staff", user: null, name: "", note: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(null); // {payload, user, oldUid, source}
  const [rowBusy, setRowBusy] = useState(null);
  const [rowError, setRowError] = useState({});


  const loadAll = useCallback(async () => {
    try {
      const today = dayKey(new Date());
      const [c, l, u] = await Promise.all([
        api.getDoorCards(),
        api.getDoorLogs({ limit: LOG_PAGE, from: today, to: today }), // [LỌC NGÀY] cho số liệu hôm nay
        api.getUsers(),
      ]);
      setCards(c.cards || []);
      setTodayLogs(l.logs || []);
      setUsers((Array.isArray(u) ? u : []).slice().sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "vi")));
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Không tải được dữ liệu khóa cửa.");
    } finally {
      setLoading(false);
    }
  }, []);

  // [LỌC NGÀY] Tìm theo tên: máy chủ tìm tên lưu trong lịch sử + mã thẻ của người khớp tên trong danh sách thẻ hiện tại
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const searchUids = useMemo(() => {
    if (!searchQ) return "";
    const f = fold(searchQ);
    return cards.filter((c) => fold(holderLabel(c)).includes(f)).map((c) => compactUid(c.card_uid)).sort().join(",");
  }, [searchQ, cards]);

  // [LỌC NGÀY] Lịch sử trong khoảng ngày đã chọn; offset > 0 = "Tải thêm"
  const fetchLogs = useCallback(
    async (offset = 0) => {
      const res = await api.getDoorLogs({
        limit: LOG_PAGE, offset, from: range.from, to: range.to, q: searchQ, uids: searchUids,
      });
      setHasMore(!!res.has_more);
      setLogs((prev) => (offset ? [...prev, ...(res.logs || [])] : res.logs || []));
    },
    [range.from, range.to, searchQ, searchUids]
  );
  const logsRef = useRef({ fetchLogs, count: 0 });
  logsRef.current = { fetchLogs, count: logs.length };

  useEffect(() => {
    if (!canManage) return;
    fetchLogs(0).catch((e) => setLoadError(e.message || "Không tải được lịch sử ra vào."));
  }, [canManage, fetchLogs]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchLogs(logs.length);
    } catch (e) {
      setLoadError(e.message || "Không tải được lịch sử ra vào.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Tải dữ liệu định kỳ (dừng khi tab trình duyệt bị ẩn)
  useEffect(() => {
    if (!canManage) return;
    loadAll();
    const slow = setInterval(() => {
      if (document.hidden) return;
      loadAll();
      // [LỌC NGÀY] đã bấm "Tải thêm" thì không làm mới lịch sử (khỏi mất phần đã tải)
      if (logsRef.current.count <= LOG_PAGE) logsRef.current.fetchLogs(0).catch(() => {});
    }, 15000);
    return () => clearInterval(slow);
  }, [canManage, loadAll]);

  const refreshAll = () => loadAll();

  // ----- Gắn thẻ với người -----
  // Người đã có thẻ khác → hỏi "Thay thẻ cũ?" trước (server cũng chặn nếu không có replace).
  const otherCardOf = (userId, uid) =>
    cards.find((c) => c.user_id === userId && compactUid(c.card_uid) !== compactUid(uid));

  const sendLink = async (payload, source, replace) => {
    setSaving(true);
    setFormError("");
    try {
      await api.addDoorCard({ ...payload, replace });
      setEditing(null);
      await refreshAll();
    } catch (e) {
      setFormError(e.message || "Không lưu được thẻ.");
    } finally {
      setSaving(false);
    }
  };

  const linkCard = (payload, user, source) => {
    const old = otherCardOf(user.id, payload.card_uid);
    if (old) setConfirmReplace({ payload, user, oldUid: old.card_uid, source });
    else sendLink(payload, source, false);
  };

  // ----- Thẻ -----
  const openAdd = (uid = "") => {
    setForm({ uid: typeof uid === "string" ? prettyUid(uid) : "", type: "staff", user: null, name: "", note: "" });
    setFormError("");
    setEditing({ mode: "add" });
  };
  const openEdit = (card) => {
    const type = isExternal(card) ? card.card_type : "staff";
    setForm({
      uid: card.card_uid,
      type,
      user: users.find((u) => u.id === card.user_id) || null,
      name: type === "staff" || isTempName(card.card_holder) ? "" : card.card_holder || "",
      note: card.note || "",
    });
    setFormError("");
    setEditing({ mode: "edit", card });
  };

  const submitCard = (e) => {
    e.preventDefault();
    const uid = compactUid(form.uid);
    if (!/^([0-9A-F]{2}){4,10}$/.test(uid)) {
      setFormError("Mã thẻ gồm 8–20 ký tự 0–9, A–F. Ví dụ: 29 02 05 B3");
      return;
    }
    const external = form.type !== "staff";
    if (external && !form.name.trim()) {
      setFormError(`Nhập tên ${TYPE_LABEL[form.type].toLowerCase()} dùng thẻ.`);
      return;
    }
    if (!external && !form.user) {
      setFormError("Chọn người dùng thẻ trong danh sách Nhân sự.");
      return;
    }
    if (editing.mode === "add" && cards.some((c) => compactUid(c.card_uid) === uid)) {
      setFormError("Thẻ này đã có trong danh sách.");
      return;
    }
    // Bảo vệ / Khách: không có trong Nhân sự, không áp luật 1 người 1 thẻ
    if (external) {
      sendLink(
        {
          card_uid: editing.mode === "edit" ? editing.card.card_uid : uid,
          card_type: form.type,
          card_holder: form.name.trim(),
          note: form.note.trim(),
          is_active: editing.mode === "edit" ? editing.card.is_active : 1,
        },
        "dialog",
        false
      );
      return;
    }
    linkCard(
      {
        card_uid: editing.mode === "edit" ? editing.card.card_uid : uid,
        user_id: form.user.id,
        card_type: "staff",
        card_holder: form.user.full_name,
        note: form.note.trim(),
        // Đổi người không được làm thẻ đang tạm khóa tự mở lại
        is_active: editing.mode === "edit" ? editing.card.is_active : 1,
      },
      form.user,
      "dialog"
    );
  };

  const toggleCard = async (card) => {
    setRowBusy(card.id);
    setRowError((m) => ({ ...m, [card.id]: "" }));
    try {
      await api.toggleDoorCard(card.card_uid);
      await refreshAll();
    } catch (e) {
      setRowError((m) => ({ ...m, [card.id]: e.message || "Không đổi được trạng thái." }));
    } finally {
      setRowBusy(null);
    }
  };

  const doDelete = async () => {
    const card = confirmDelete;
    setRowBusy(card.id);
    try {
      await api.deleteDoorCard(card.card_uid);
      setConfirmDelete(null);
      await refreshAll();
    } catch (e) {
      setRowError((m) => ({ ...m, [card.id]: e.message || "Không xóa được thẻ." }));
      setConfirmDelete(null);
    } finally {
      setRowBusy(null);
    }
  };

  // ----- Số liệu -----
  const holderByUid = useMemo(() => {
    const m = {};
    cards.forEach((c) => (m[compactUid(c.card_uid)] = holderLabel(c)));
    return m;
  }, [cards]);

  const parseLogs = useCallback(
    (list) =>
      list
        .map((l) => {
          const d = parseLocal(l.created_at);
          const info = classifyLog(l);
          // Tên lấy theo danh sách thẻ hiện tại (đổi tên thì lịch sử cũng đổi theo)
          const current = holderByUid[compactUid(l.card_uid)];
          if (info.kind !== "out" && current && !isTempName(current)) info.who = current;
          return { ...l, date: d, ...info };
        })
        .filter((l) => l.date)
        // Khóa có thể gửi muộn → sắp theo giờ quẹt thật, không theo thứ tự nhận
        .sort((a, b) => b.date - a.date || b.id - a.id),
    [holderByUid]
  );
  const parsedLogs = useMemo(() => parseLogs(logs), [logs, parseLogs]);

  const today = dayKey(new Date());
  const stats = useMemo(() => {
    const t = parseLogs(todayLogs).filter((l) => dayKey(l.date) === today); // [LỌC NGÀY] không phụ thuộc khoảng đang xem
    return {
      active: cards.filter((c) => c.is_active === 1).length,
      total: cards.length,
      inToday: t.filter((l) => l.kind === "in").length,
      deniedToday: t.filter((l) => l.kind === "denied").length,
      last: t[0],
    };
  }, [todayLogs, parseLogs, cards, today]);

  const q = query.trim().toLowerCase();
  const visibleCards = useMemo(
    () =>
      cards.filter(
        (c) =>
          !q ||
          holderLabel(c).toLowerCase().includes(q) ||
          compactUid(c.card_uid).toLowerCase().includes(q.replace(/\s/g, ""))
      ),
    [cards, q]
  );

  const groupedLogs = useMemo(() => {
    // [LỌC NGÀY] tìm theo tên đã làm ở máy chủ (searchQ); ở đây chỉ lọc Vào / Ra / Từ chối
    const list = parsedLogs.filter((l) => logFilter === "all" || l.kind === logFilter);
    const groups = [];
    list.forEach((l) => {
      const k = dayKey(l.date);
      if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, label: dayLabel(l.date), items: [] });
      groups[groups.length - 1].items.push(l);
    });
    return groups;
  }, [parsedLogs, logFilter]);

  // ----- Không có quyền -----
  if (!canManage) {
    return (
      <div className="dl-page">
        <div className="dl-empty">
          <Lock size={28} />
          <h2>Chỉ quản trị viên xem được trang này</h2>
          <p>Liên hệ quản trị viên lab nếu bạn cần cấp hoặc đổi thẻ ra vào.</p>
        </div>
      </div>
    );
  }


  return (
    <div className="dl-page">
      {/* Tiêu đề */}
      <header className="dl-header">
        <div>
          <h1 className="dl-title">Khóa cửa lab</h1>
          <p className="dl-subtitle">Quản lý thẻ ra vào và xem ai đã vào lab.</p>
        </div>
        <div className="dl-tools">
          <button type="button" className="dl-btn" onClick={() => { setLoading(true); loadAll(); }}>
            <RefreshCw size={16} /> Làm mới
          </button>
          {/* [1 NÚT] bật/tắt chế độ quản lý thẻ */}
          <button
            type="button"
            className={manage ? "dl-btn" : "dl-btn dl-btn--primary"}
            aria-pressed={manage}
            onClick={() => { setManage((m) => !m); setTab("cards"); }}
          >
            {manage ? <><Check size={16} /> Xong</> : <><Pencil size={16} /> Quản lý thẻ</>}
          </button>
        </div>
      </header>

      {loadError && (
        <div className="dl-alert" role="alert">
          <CircleAlert size={18} /> {loadError}
          <button type="button" className="dl-link" onClick={loadAll}>Thử lại</button>
        </div>
      )}

      {/* Số liệu */}
      <section className="dl-stats" aria-label="Tóm tắt">
        <div className="dl-stat">
          <span className="dl-stat-label">Thẻ đang dùng</span>
          <span className="dl-stat-value dl-num">{loading ? "–" : stats.active}</span>
          <span className="dl-stat-hint dl-num">{stats.total - stats.active > 0 ? `${stats.total - stats.active} thẻ tạm khóa` : "Tất cả đang hoạt động"}</span>
        </div>
        <div className="dl-stat">
          <span className="dl-stat-label">Lượt vào hôm nay</span>
          <span className="dl-stat-value dl-num">{loading ? "–" : stats.inToday}</span>
          <span className="dl-stat-hint dl-num">
            {stats.last ? `Gần nhất ${pad(stats.last.date.getHours())}:${pad(stats.last.date.getMinutes())} · ${stats.last.who}` : "Chưa có lượt nào"}
          </span>
        </div>
        <div className={`dl-stat ${stats.deniedToday > 0 ? "dl-stat--warn" : ""}`}>
          <span className="dl-stat-label">Thẻ bị từ chối hôm nay</span>
          <span className="dl-stat-value dl-num">{loading ? "–" : stats.deniedToday}</span>
          <span className="dl-stat-hint">{stats.deniedToday > 0 ? "Xem trong Lịch sử ra vào" : "Không có"}</span>
        </div>
      </section>
      {/* Tab + công cụ */}
      <div className="dl-toolbar">
        <div className="dl-tabs" role="tablist" aria-label="Nội dung">
          <button type="button" role="tab" aria-selected={tab === "cards"} className="dl-tab" onClick={() => setTab("cards")}>
            Thẻ ra vào <span className="dl-count dl-num">{cards.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "history"} className="dl-tab" onClick={() => setTab("history")}>
            Lịch sử ra vào
          </button>
        </div>
        <div className="dl-tools">
          <label className="dl-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "cards" ? "Tìm tên hoặc mã thẻ" : "Tìm theo tên"}
              aria-label="Tìm kiếm"
            />
          </label>
          {tab === "cards" && manage && (
            <button type="button" className="dl-btn dl-btn--primary" onClick={openAdd}>
              <Plus size={16} /> Thêm thẻ
            </button>
          )}
        </div>
      </div>

      {/* ===== Thẻ ===== */}
      {tab === "cards" && (
        <section className="dl-panel" aria-label="Danh sách thẻ">
          {manage && (
            <p className="dl-hint">
              Đang quản lý thẻ. Thẻ thêm, đổi người hoặc xóa được cập nhật xuống khóa ở lần khóa thức dậy tiếp theo (có người quẹt thẻ, bấm nút hoặc đóng cửa). Xong bấm “Xong”.
            </p>
          )}

          {loading ? (
            <ul className="dl-list" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="dl-row dl-row--skeleton"><span /><span /><span /></li>
              ))}
            </ul>
          ) : visibleCards.length === 0 ? (
            <div className="dl-empty">
              <DoorOpen size={28} />
              {cards.length === 0 ? (
                <>
                  <h2>Chưa có thẻ nào</h2>
                  <p>Thêm thẻ đầu tiên để người dùng quẹt mở cửa.</p>
                  <button type="button" className="dl-btn dl-btn--primary" onClick={() => { setManage(true); openAdd(); }}><Plus size={16} /> Thêm thẻ</button>
                </>
              ) : (
                <>
                  <h2>Không tìm thấy thẻ nào</h2>
                  <p>Không có tên hoặc mã thẻ khớp với “{query}”.</p>
                  <button type="button" className="dl-btn" onClick={() => setQuery("")}>Xóa tìm kiếm</button>
                </>
              )}
            </div>
          ) : (
            <ul className="dl-list">
              <li className="dl-row dl-row--head" aria-hidden="true">
                <span>Người dùng</span><span>Trạng thái</span><span>Ngày thêm</span><span />
              </li>
              {visibleCards.map((c) => {
                const ext = isExternal(c);   // thẻ Bảo vệ / Khách
                const temp = !c.user_id && !ext;   // thẻ chưa gắn người trong Nhân sự
                const oldName = temp && !isTempName(c.card_holder) ? c.card_holder : "";   // tên gõ tay trước đây
                const added = parseLocal(c.created_at);
                return (
                  <li key={c.id} className={`dl-row ${c.is_active ? "" : "dl-row--off"}`}>
                    <div className="dl-person">
                      <span className="dl-avatar" aria-hidden="true">{temp ? "?" : initials(c.card_holder)}</span>
                      <div className="dl-person-text">
                        <span className="dl-person-name">
                          {temp && manage ? (
                            <button type="button" className="dl-link" onClick={() => openEdit(c)}>Chưa gắn người – chọn người</button>
                          ) : temp ? (
                            <span className="dl-muted">Chưa gắn người</span>
                          ) : (
                            <>
                              {c.card_holder}
                              {ext && <span className="dl-badge dl-badge--type">{TYPE_LABEL[c.card_type]}</span>}
                            </>
                          )}
                        </span>
                        <span className="dl-uid dl-num">
                          {prettyUid(c.card_uid)}
                          {oldName ? ` · tên cũ: ${oldName}` : ""}
                          {c.note ? ` · ${c.note}` : ""}
                        </span>
                      </div>
                    </div>
                    <span>
                      {c.is_active ? (
                        <span className="dl-badge dl-badge--ok">Đang dùng</span>
                      ) : (
                        <span className="dl-badge dl-badge--off">Tạm khóa</span>
                      )}
                    </span>
                    <span className="dl-muted dl-num">{added ? added.toLocaleDateString("vi-VN") : "–"}</span>
                    <div className="dl-row-actions" hidden={!manage}>
                      <button type="button" className="dl-icon-btn" aria-label={`Đổi người dùng thẻ ${c.card_holder || ""}`} title="Đổi người" onClick={() => openEdit(c)}>
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="dl-icon-btn"
                        aria-label={c.is_active ? "Tạm khóa thẻ" : "Mở lại thẻ"}
                        title={c.is_active ? "Tạm khóa" : "Mở lại"}
                        disabled={rowBusy === c.id}
                        onClick={() => toggleCard(c)}
                      >
                        {c.is_active ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                      <button
                        type="button"
                        className="dl-icon-btn dl-icon-btn--danger"
                        aria-label={`Xóa thẻ ${c.card_holder || ""}`}
                        title="Xóa"
                        disabled={rowBusy === c.id}
                        onClick={() => setConfirmDelete(c)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {rowError[c.id] && <span className="dl-inline-error dl-row-error">{rowError[c.id]}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ===== Lịch sử ===== */}
      {tab === "history" && (
        <section className="dl-panel" aria-label="Lịch sử ra vào">
          {/* [LỌC NGÀY] khoảng ngày */}
          <div className="dl-chips dl-range" role="group" aria-label="Khoảng ngày">
            {[
              ["today", "Hôm nay"],
              ["7d", "7 ngày"],
              ["month", "Tháng này"],
            ].map(([k, label]) => (
              <button key={k} type="button" className="dl-chip" aria-pressed={range.preset === k} onClick={() => setRange(presetRange(k))}>
                {label}
              </button>
            ))}
            <label className="dl-date">
              Từ
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => e.target.value && setRange((r) => ({ preset: "custom", from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))}
              />
            </label>
            <label className="dl-date">
              Đến
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => e.target.value && setRange((r) => ({ preset: "custom", from: r.from > e.target.value ? e.target.value : r.from, to: e.target.value }))}
              />
            </label>
          </div>
          <div className="dl-chips" role="group" aria-label="Lọc">
            {[
              ["all", "Tất cả"],
              ["in", "Vào"],
              ["out", "Ra"],
              ["denied", "Từ chối"],
            ].map(([k, label]) => (
              <button key={k} type="button" className="dl-chip" aria-pressed={logFilter === k} onClick={() => setLogFilter(k)}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <ul className="dl-list" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="dl-row dl-row--skeleton"><span /><span /><span /></li>
              ))}
            </ul>
          ) : groupedLogs.length === 0 ? (
            <div className="dl-empty">
              <LogIn size={28} />
              <h2>Chưa có lượt ra vào</h2>
              <p>{logFilter === "all" && !q ? "Không có lượt quẹt nào trong khoảng ngày này." : "Không có lượt nào khớp bộ lọc."}</p>
              {(logFilter !== "all" || q) && (
                <button type="button" className="dl-btn" onClick={() => { setLogFilter("all"); setQuery(""); }}>Xem tất cả</button>
              )}
            </div>
          ) : (
            groupedLogs.map((g) => (
              <div key={g.key} className="dl-day">
                <h3 className="dl-day-title">{g.label} <span className="dl-muted dl-num">· {g.items.length} lượt</span></h3>
                <ul className="dl-list">
                  {g.items.map((l) => (
                    <li key={l.id} className="dl-log">
                      <span className="dl-log-time dl-num">{pad(l.date.getHours())}:{pad(l.date.getMinutes())}</span>
                      <span className={`dl-log-icon dl-log-icon--${l.kind}`} aria-hidden="true">
                        {l.kind === "in" ? <LogIn size={16} /> : l.kind === "out" ? <LogOut size={16} /> : <ShieldX size={16} />}
                      </span>
                      <span className="dl-log-who">
                        <span className="dl-person-name">{l.who}</span>
                        {l.kind !== "out" && l.card_uid && l.card_uid !== "ADMIN_REMOTE" && (
                          <span className="dl-uid dl-num">{prettyUid(l.card_uid)}</span>
                        )}
                      </span>
                      <span className="dl-log-end">
                        {l.kind === "denied" && l.card_uid && !holderByUid[compactUid(l.card_uid)] && (
                          <button type="button" className="dl-link dl-log-add" onClick={() => { setManage(true); openAdd(l.card_uid); }}>
                            <Plus size={14} /> Thêm thẻ này
                          </button>
                        )}
                        <span className={`dl-badge ${l.kind === "denied" ? "dl-badge--bad" : l.kind === "out" ? "dl-badge--off" : "dl-badge--ok"}`}>
                          {l.label}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {/* [LỌC NGÀY] lịch sử không giới hạn: còn lượt cũ hơn trong khoảng ngày thì tải tiếp */}
          {!loading && hasMore && (
            <div className="dl-more">
              <button type="button" className="dl-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Đang tải…" : "Tải thêm lượt cũ hơn"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Thêm thẻ / đổi người dùng thẻ */}
      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.mode === "edit" ? "Đổi người dùng thẻ" : "Thêm thẻ"}
      >
        <form className="dl-form" onSubmit={submitCard} noValidate>
          <label className="dl-field">
            <span>Mã thẻ</span>
            <input
              value={editing?.mode === "edit" ? prettyUid(form.uid) : form.uid}
              onChange={(e) => setForm({ ...form, uid: e.target.value })}
              placeholder="VD: 29 02 05 B3"
              disabled={editing?.mode === "edit"}
              autoComplete="off"
              spellCheck={false}
              className="dl-num"
              data-autofocus={editing?.mode === "add" && !form.uid ? "" : undefined}
            />
            {editing?.mode === "add" && <small>Mã in trên thẻ, hoặc chạm thẻ vào khóa trong chế độ quản lý thẻ.</small>}
          </label>
          <fieldset className="dl-field dl-type">
            <legend>Loại người dùng</legend>
            <div className="dl-type-options">
              {Object.entries(TYPE_LABEL).map(([v, label]) => (
                <label key={v} className="dl-type-option">
                  <input
                    type="radio"
                    name="card_type"
                    value={v}
                    checked={form.type === v}
                    onChange={() => setForm((f) => ({ ...f, type: v }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {form.type === "staff" ? (
            <div className="dl-field">
              <span>Người dùng thẻ</span>
              <PersonPicker
                users={users}
                cards={cards}
                value={form.user}
                onChange={(u) => setForm((f) => ({ ...f, user: u }))}
                currentUid={form.uid}
                autoFocus={editing?.mode === "edit" || !!form.uid}
              />
              <small>Chỉ chọn được người có trong Nhân sự. Mỗi người 1 thẻ.</small>
            </div>
          ) : (
            <label className="dl-field">
              <span>Tên {TYPE_LABEL[form.type].toLowerCase()}</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={form.type === "guard" ? "VD: Anh Tuấn – ca đêm" : "VD: Chị Lan – đối tác ABC"}
                autoComplete="off"
              />
              <small>Không cần có trong Nhân sự. Khách về thì tạm khóa hoặc xóa thẻ.</small>
            </label>
          )}
          <label className="dl-field">
            <span>Ghi chú <em>(không bắt buộc)</em></span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: Sinh viên K67" autoComplete="off" />
          </label>
          {formError && <p className="dl-inline-error" role="alert">{formError}</p>}
          <div className="dl-form-actions">
            <button type="button" className="dl-btn" onClick={() => setEditing(null)} disabled={saving}>Hủy</button>
            <button type="submit" className="dl-btn dl-btn--primary" disabled={saving}>
              {saving ? "Đang lưu…" : editing?.mode === "edit" ? "Lưu" : "Thêm thẻ"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Người đã có thẻ: hỏi thay thẻ cũ */}
      <Modal alert open={!!confirmReplace} onClose={() => setConfirmReplace(null)} title="Thay thẻ cũ?">
        <p className="dl-dialog-body">
          <strong>{confirmReplace?.user.full_name}</strong> đang có thẻ{" "}
          <strong className="dl-num">{prettyUid(confirmReplace?.oldUid)}</strong>. Mỗi người chỉ được 1 thẻ: thẻ cũ sẽ bị xóa
          và không mở được cửa nữa, thẻ <strong className="dl-num">{prettyUid(confirmReplace?.payload.card_uid)}</strong> được gắn thay.
        </p>
        <div className="dl-form-actions">
          <button type="button" className="dl-btn" data-autofocus="" onClick={() => setConfirmReplace(null)}>Hủy</button>
          <button
            type="button"
            className="dl-btn dl-btn--danger"
            onClick={() => {
              const r = confirmReplace;
              setConfirmReplace(null);
              sendLink(r.payload, r.source, true);
            }}
          >
            Thay thẻ cũ
          </button>
        </div>
      </Modal>

      {/* Xác nhận xóa */}
      <Modal alert open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Xóa thẻ?">
        <p className="dl-dialog-body">
          Thẻ <strong className="dl-num">{prettyUid(confirmDelete?.card_uid)}</strong> của{" "}
          <strong>{confirmDelete && isExternal(confirmDelete) ? holderLabel(confirmDelete) : !confirmDelete?.user_id ? "người chưa gắn" : confirmDelete?.card_holder}</strong> sẽ không mở được cửa nữa.
          Lịch sử ra vào cũ vẫn được giữ.
        </p>
        <p className="dl-dialog-note">Chỉ muốn chặn tạm thời? Dùng nút khóa thay vì xóa.</p>
        <div className="dl-form-actions">
          <button type="button" className="dl-btn" data-autofocus="" onClick={() => setConfirmDelete(null)}>Hủy</button>
          <button type="button" className="dl-btn dl-btn--danger" disabled={rowBusy === confirmDelete?.id} onClick={doDelete}>
            Xóa thẻ
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default DoorLockPage;
