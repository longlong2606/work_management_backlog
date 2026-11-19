// [ESP-LOCK] Trang Khóa cửa lab (ESP8266 + PN532), viết lại cho người dùng:
// chỉ gồm thẻ (thêm / đổi tên / tạm khóa / xóa), lịch sử ra vào và phiên quản lý thẻ.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  DoorOpen,
  KeyRound,
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
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import "./DoorLockPage.css";

// ---------- Tiện ích hiển thị ----------
const compactUid = (uid) => (uid || "").replace(/[^0-9a-z]/gi, "").toUpperCase();
const prettyUid = (uid) => compactUid(uid).replace(/(..)(?=.)/g, "$1 ");
// Tên tạm khóa tự đặt khi thêm bằng thẻ Master: "The moi 19/11 14:05"
const isTempName = (name) => !name || /^th[eẻ] m[oớ]i\b/i.test(name.trim());
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
const fmtCountdown = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

// Phân loại một dòng lịch sử
function classifyLog(log) {
  if (log.card_uid === "EXIT" || log.action === "exit") return { kind: "out", label: "Ra", who: "Mở từ bên trong" };
  if (log.card_uid === "ADMIN_REMOTE") return { kind: "in", label: "Mở", who: `Mở từ web · ${log.card_holder || "quản trị"}` };
  if (log.status === "granted") return { kind: "in", label: "Vào", who: log.card_holder || "Chưa đặt tên" };
  return { kind: "denied", label: "Từ chối", who: log.card_holder || "Thẻ lạ" };
}

// ---------- Hộp thoại (dùng <dialog> gốc: tự giữ focus, Esc để đóng) ----------
function Modal({ open, onClose, title, children, labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal tự focus nút đầu tiên (nút Đóng); chuyển sang ô/nút được đánh dấu
      d.querySelector("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dl-dialog"
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dl-dialog-head">
        <h2 id={labelledBy} className="dl-dialog-title">{title}</h2>
        <button type="button" className="dl-icon-btn" aria-label="Đóng" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}

// ---------- Thanh phiên quản lý thẻ ----------
function SessionBanner({ session, now, busy, error, onAction, savedNotice }) {
  if (savedNotice) {
    return (
      <div className="dl-session dl-session--done" role="status">
        <div className="dl-session-icon"><Check size={20} /></div>
        <div className="dl-session-text">
          <strong>Đã lưu. Khóa cửa đang cập nhật danh sách thẻ.</strong>
          <span>Khóa sẽ kêu 3 tiếng bíp khi xong, rồi hoạt động bình thường.</span>
        </div>
      </div>
    );
  }
  if (!session) return null;

  const left = Math.max(0, session.seconds_left - Math.floor((now - session._fetchedAt) / 1000));
  const offline = !session.lock_online;

  if (session.status === "pending") {
    return (
      <div className="dl-session dl-session--ask" role="alert">
        <div className="dl-session-icon"><KeyRound size={20} /></div>
        <div className="dl-session-text">
          <strong>Khóa cửa xin vào chế độ quản lý thẻ</strong>
          <span>
            Có người vừa giữ nút trong cửa 3 giây. Đồng ý để thêm, xóa thẻ và cập nhật ngay xuống khóa.
            <span className="dl-num"> Còn {left} giây.</span>
          </span>
          {error && <span className="dl-inline-error">{error}</span>}
        </div>
        <div className="dl-session-actions">
          <button type="button" className="dl-btn" disabled={busy} onClick={() => onAction("deny")}>
            Từ chối
          </button>
          <button type="button" className="dl-btn dl-btn--primary" disabled={busy} onClick={() => onAction("approve")}>
            Đồng ý
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dl-session dl-session--edit" role="status">
      <div className="dl-session-icon"><Unlock size={20} /></div>
      <div className="dl-session-text">
        <strong>Đang trong chế độ quản lý thẻ</strong>
        <span>
          Thêm, đổi tên hoặc xóa thẻ bên dưới, xong bấm Lưu để gửi xuống khóa.
          <span className="dl-num"> Còn {fmtCountdown(left)}.</span>
          {offline && <span className="dl-warn-text"> Khóa đang mất kết nối.</span>}
        </span>
        {error && <span className="dl-inline-error">{error}</span>}
      </div>
      <div className="dl-session-actions">
        <button type="button" className="dl-btn dl-btn--primary" disabled={busy} onClick={() => onAction("save")}>
          <Check size={16} /> Lưu và gửi xuống khóa
        </button>
      </div>
    </div>
  );
}

// ---------- Trang ----------
export function DoorLockPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "leader";

  const [tab, setTab] = useState("cards"); // cards | history
  const [cards, setCards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [logFilter, setLogFilter] = useState("all"); // all | in | out | denied

  // Phiên quản lý thẻ
  const [session, setSession] = useState(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Hộp thoại
  const [editing, setEditing] = useState(null); // null | {mode:'add'|'edit', card?}
  const [form, setForm] = useState({ uid: "", name: "", note: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [rowBusy, setRowBusy] = useState(null);
  const [rowError, setRowError] = useState({});

  const loadAll = useCallback(async () => {
    try {
      const [c, l] = await Promise.all([api.getDoorCards(), api.getDoorLogs(300)]);
      setCards(c.cards || []);
      setLogs(l.logs || []);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Không tải được dữ liệu khóa cửa.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const r = await api.getDoorSession();
      setSession(r.session ? { ...r.session, _fetchedAt: Date.now() } : null);
    } catch {
      /* mạng chập chờn: giữ trạng thái cũ, lần sau hỏi lại */
    }
  }, []);

  // Tải dữ liệu + hỏi phiên định kỳ (dừng khi tab trình duyệt bị ẩn)
  useEffect(() => {
    if (!canManage) return;
    loadAll();
    loadSession();
    const fast = setInterval(() => {
      if (!document.hidden) loadSession();
    }, 3000);
    const slow = setInterval(() => {
      if (!document.hidden) loadAll();
    }, 15000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [canManage, loadAll, loadSession]);

  // Đồng hồ đếm ngược chỉ chạy khi có phiên
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  const sessionAction = async (op) => {
    if (!session) return;
    setSessionBusy(true);
    setSessionError("");
    try {
      const r = await api.doorSessionAction(session.id, op);
      if (op === "save") {
        setSession(null);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 8000);
      } else {
        setSession(r.session && (r.session.status === "pending" || r.session.status === "approved")
          ? { ...r.session, _fetchedAt: Date.now() }
          : null);
      }
    } catch (e) {
      setSessionError(e.message || "Không thực hiện được, thử lại.");
      loadSession();
    } finally {
      setSessionBusy(false);
    }
  };

  // ----- Thẻ -----
  const openAdd = (uid = "") => {
    setForm({ uid: typeof uid === "string" ? prettyUid(uid) : "", name: "", note: "" });
    setFormError("");
    setEditing({ mode: "add" });
  };
  const openEdit = (card) => {
    setForm({ uid: card.card_uid, name: isTempName(card.card_holder) ? "" : card.card_holder || "", note: card.note || "" });
    setFormError("");
    setEditing({ mode: "edit", card });
  };

  const submitCard = async (e) => {
    e.preventDefault();
    const uid = compactUid(form.uid);
    const name = form.name.trim();
    if (!/^([0-9A-F]{2}){4,10}$/.test(uid)) {
      setFormError("Mã thẻ gồm 8–20 ký tự 0–9, A–F. Ví dụ: 29 02 05 B3");
      return;
    }
    if (!name) {
      setFormError("Nhập tên người dùng thẻ.");
      return;
    }
    if (editing.mode === "add" && cards.some((c) => compactUid(c.card_uid) === uid)) {
      setFormError("Thẻ này đã có trong danh sách.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await api.addDoorCard({
        card_uid: editing.mode === "edit" ? editing.card.card_uid : uid,
        card_holder: name,
        note: form.note.trim(),
        // Đổi tên không được làm thẻ đang tạm khóa tự mở lại
        is_active: editing.mode === "edit" ? editing.card.is_active : 1,
      });
      setEditing(null);
      loadAll();
    } catch (err) {
      setFormError(err.message || "Không lưu được thẻ.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCard = async (card) => {
    setRowBusy(card.id);
    setRowError((m) => ({ ...m, [card.id]: "" }));
    try {
      await api.toggleDoorCard(card.card_uid);
      await loadAll();
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
      await loadAll();
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
    cards.forEach((c) => (m[compactUid(c.card_uid)] = c.card_holder));
    return m;
  }, [cards]);

  const parsedLogs = useMemo(
    () =>
      logs
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
    [logs, holderByUid]
  );

  const today = dayKey(new Date());
  const stats = useMemo(() => {
    const t = parsedLogs.filter((l) => dayKey(l.date) === today);
    return {
      active: cards.filter((c) => c.is_active === 1).length,
      total: cards.length,
      inToday: t.filter((l) => l.kind === "in").length,
      deniedToday: t.filter((l) => l.kind === "denied").length,
      last: parsedLogs[0],
    };
  }, [parsedLogs, cards, today]);

  const q = query.trim().toLowerCase();
  const visibleCards = useMemo(
    () =>
      cards.filter(
        (c) =>
          !q ||
          (c.card_holder || "").toLowerCase().includes(q) ||
          compactUid(c.card_uid).toLowerCase().includes(q.replace(/\s/g, ""))
      ),
    [cards, q]
  );

  const groupedLogs = useMemo(() => {
    const list = parsedLogs.filter(
      (l) => (logFilter === "all" || l.kind === logFilter) && (!q || l.who.toLowerCase().includes(q))
    );
    const groups = [];
    list.forEach((l) => {
      const k = dayKey(l.date);
      if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, label: dayLabel(l.date), items: [] });
      groups[groups.length - 1].items.push(l);
    });
    return groups;
  }, [parsedLogs, logFilter, q]);

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

  const inSession = session?.status === "approved";

  return (
    <div className="dl-page">
      {/* Tiêu đề */}
      <header className="dl-header">
        <div>
          <h1 className="dl-title">Khóa cửa lab</h1>
          <p className="dl-subtitle">Quản lý thẻ ra vào và xem ai đã vào lab.</p>
        </div>
        <button type="button" className="dl-btn" onClick={() => { setLoading(true); loadAll(); loadSession(); }}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </header>

      <SessionBanner
        session={session}
        now={now}
        busy={sessionBusy}
        error={sessionError}
        onAction={sessionAction}
        savedNotice={savedNotice}
      />

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
          {tab === "cards" && (
            <button type="button" className="dl-btn dl-btn--primary" onClick={openAdd}>
              <Plus size={16} /> Thêm thẻ
            </button>
          )}
        </div>
      </div>

      {/* ===== Thẻ ===== */}
      {tab === "cards" && (
        <section className="dl-panel" aria-label="Danh sách thẻ">
          {!inSession && cards.length > 0 && (
            <p className="dl-hint">
              Thẻ thêm hoặc xóa ở đây sẽ áp dụng ở lần khóa cập nhật tiếp theo. Muốn áp dụng ngay: giữ nút trong cửa 3 giây rồi bấm Đồng ý.
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
                  <button type="button" className="dl-btn dl-btn--primary" onClick={openAdd}><Plus size={16} /> Thêm thẻ</button>
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
                const temp = isTempName(c.card_holder);
                const added = parseLocal(c.created_at);
                return (
                  <li key={c.id} className={`dl-row ${c.is_active ? "" : "dl-row--off"}`}>
                    <div className="dl-person">
                      <span className="dl-avatar" aria-hidden="true">{temp ? "?" : initials(c.card_holder)}</span>
                      <div className="dl-person-text">
                        <span className="dl-person-name">
                          {temp ? (
                            <button type="button" className="dl-link" onClick={() => openEdit(c)}>Thẻ mới – đặt tên</button>
                          ) : (
                            c.card_holder
                          )}
                        </span>
                        <span className="dl-uid dl-num">{prettyUid(c.card_uid)}{c.note ? ` · ${c.note}` : ""}</span>
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
                    <div className="dl-row-actions">
                      <button type="button" className="dl-icon-btn" aria-label={`Đổi tên ${c.card_holder || "thẻ"}`} title="Đổi tên" onClick={() => openEdit(c)}>
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
              <p>{logFilter === "all" && !q ? "Lượt quẹt thẻ sẽ hiện ở đây sau khi khóa gửi lên." : "Không có lượt nào khớp bộ lọc."}</p>
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
                          <button type="button" className="dl-link dl-log-add" onClick={() => openAdd(l.card_uid)}>
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
        </section>
      )}

      {/* Thêm / đổi tên thẻ */}
      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.mode === "edit" ? "Đổi thông tin thẻ" : "Thêm thẻ"}
        labelledBy="dl-card-dialog"
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
            {editing?.mode === "add" && <small>Mã in trên thẻ, hoặc lấy từ dòng “Thẻ lạ” trong Lịch sử ra vào.</small>}
          </label>
          <label className="dl-field">
            <span>Tên người dùng</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VD: Nguyễn Văn A"
              autoComplete="off"
              data-autofocus={editing?.mode === "edit" || form.uid ? "" : undefined}
            />
          </label>
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

      {/* Xác nhận xóa */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Xóa thẻ?" labelledBy="dl-delete-dialog">
        <p className="dl-dialog-body">
          Thẻ <strong className="dl-num">{prettyUid(confirmDelete?.card_uid)}</strong> của{" "}
          <strong>{isTempName(confirmDelete?.card_holder) ? "người chưa đặt tên" : confirmDelete?.card_holder}</strong> sẽ không mở được cửa nữa.
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
