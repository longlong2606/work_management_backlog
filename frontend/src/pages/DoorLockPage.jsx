import React, { useState, useEffect, useCallback } from "react";
import {
  Key,
  Unlock,
  Lock,
  RefreshCw,
  Copy,
  Check,
  Cpu,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Send,
  Trash2,
  ExternalLink,
  Wifi,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
  CreditCard,
  Plus,
  Search,
  FileText,
  Code,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  UserX,
} from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";

export function DoorLockPage() {
  const { user, isAdmin, isLeader } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState("cards"); // "cards" | "docs" | "logs" | "esp8266" | "tester" | "settings"
  const [settings, setSettings] = useState({
    key: "09vjh9KZDp5t",
    relay_duration: 5,
    default_key: "09vjh9KZDp5t",
  });
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Cards State
  const [cards, setCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [newCardForm, setNewCardForm] = useState({
    card_uid: "",
    card_holder: "",
    note: "",
    is_active: 1,
  });
  const [savingCard, setSavingCard] = useState(false);

  // Copy states
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedDoc, setCopiedDoc] = useState(false);
  const [toast, setToast] = useState(null);

  // Form chỉnh sửa key
  const [newKey, setNewKey] = useState("09vjh9KZDp5t");
  const [newDuration, setNewDuration] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);

  // API Tester State
  const [testMac, setTestMac] = useState("24:6F:28:AB:CD:EF");
  const [testKey, setTestKey] = useState("09vjh9KZDp5t");
  const [testCardUid, setTestCardUid] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  // Remote Unlock State
  const [remoteUnlocking, setRemoteUnlocking] = useState(false);
  const [isUnlockedEffect, setIsUnlockedEffect] = useState(false);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Tải cấu hình khóa
  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.getDoorSettings();
      if (res && res.success) {
        setSettings(res);
        setNewKey(res.key || "09vjh9KZDp5t");
        setNewDuration(res.relay_duration || 5);
      }
    } catch (err) {
      console.error("Lỗi khi tải cấu hình khóa cửa:", err);
    }
  }, []);

  // Tải danh sách thẻ
  const fetchCards = useCallback(async (searchQuery = "") => {
    setLoadingCards(true);
    try {
      const res = await api.getDoorCards(searchQuery);
      if (res && res.cards) {
        setCards(res.cards);
      }
    } catch (err) {
      console.error("Lỗi khi tải danh sách thẻ:", err);
    } finally {
      setLoadingCards(false);
    }
  }, []);

  // Tải lịch sử mở cửa
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await api.getDoorLogs(100);
      if (res && res.logs) {
        setLogs(res.logs);
      }
    } catch (err) {
      console.error("Lỗi khi tải nhật ký khóa cửa:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchCards();
    fetchLogs();
  }, [fetchSettings, fetchCards, fetchLogs]);

  // Tự động làm mới log mỗi 6 giây nếu bật autoRefresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // Thêm thẻ mới
  const handleAddCardSubmit = async (e) => {
    e.preventDefault();
    if (!newCardForm.card_uid.trim()) {
      showToast("Vui lòng nhập mã thẻ (card_uid)!", "danger");
      return;
    }
    setSavingCard(true);
    try {
      const res = await api.addDoorCard({
        card_uid: newCardForm.card_uid.trim(),
        card_holder: newCardForm.card_holder.trim(),
        note: newCardForm.note.trim(),
        is_active: Number(newCardForm.is_active) || 1,
        key: settings.key,
      });
      showToast(res.message || "Đã lưu thẻ thành công!");
      setShowAddCardModal(false);
      setNewCardForm({ card_uid: "", card_holder: "", note: "", is_active: 1 });
      fetchCards(cardSearch);
    } catch (err) {
      showToast("Lỗi khi thêm thẻ: " + (err.message || ""), "danger");
    } finally {
      setSavingCard(false);
    }
  };

  // Xóa thẻ
  const handleDeleteCard = async (card) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa thẻ UID: "${card.card_uid}" (${card.card_holder || "Chưa đặt tên"}) khỏi hệ thống?`)) {
      return;
    }
    try {
      const res = await api.deleteDoorCard(card.card_uid);
      showToast(res.message || "Đã xóa thẻ thành công!");
      fetchCards(cardSearch);
    } catch (err) {
      showToast("Lỗi khi xóa thẻ: " + (err.message || ""), "danger");
    }
  };

  // Khóa / Mở khóa thẻ (Toggle)
  const handleToggleCard = async (card) => {
    try {
      const res = await api.toggleDoorCard(card.card_uid);
      showToast(res.message || "Đã cập nhật trạng thái thẻ!");
      fetchCards(cardSearch);
    } catch (err) {
      showToast("Lỗi khi chuyển trạng thái thẻ: " + (err.message || ""), "danger");
    }
  };

  // Xử lý mở khóa từ xa
  const handleRemoteUnlock = async () => {
    setRemoteUnlocking(true);
    try {
      const res = await api.unlockDoorRemote();
      showToast(res.message || "Đã kích hoạt lệnh mở khóa cửa từ xa!");
      setIsUnlockedEffect(true);
      setTimeout(() => setIsUnlockedEffect(false), 5000);
      fetchLogs();
    } catch (err) {
      showToast("Lỗi khi mở khóa: " + (err.message || ""), "danger");
    } finally {
      setRemoteUnlocking(false);
    }
  };

  // Lưu cấu hình key
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!newKey.trim()) {
      showToast("Vui lòng nhập mã khóa bí mật!", "danger");
      return;
    }
    setSavingSettings(true);
    try {
      await api.updateDoorSettings({
        key: newKey.trim(),
        relay_duration: Number(newDuration) || 5,
      });
      showToast("Đã cập nhật mã khóa thành công!");
      fetchSettings();
    } catch (err) {
      showToast("Lỗi khi lưu cài đặt: " + (err.message || ""), "danger");
    } finally {
      setSavingSettings(false);
    }
  };

  // Xóa sạch logs
  const handleClearLogs = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử quét khóa cửa?")) return;
    try {
      await api.clearDoorLogs();
      showToast("Đã xóa sạch lịch sử mở cửa!");
      fetchLogs();
    } catch (err) {
      showToast("Lỗi khi xóa nhật ký: " + (err.message || ""), "danger");
    }
  };

  // Test API từ giao diện
  const handleRunTest = async (e) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const ts = Math.floor(Date.now() / 1000).toString();
      const res = await api.testDoorAccess(testKey, testMac, ts, testCardUid);
      setTestResult({
        timestamp: ts,
        data: res,
      });
      fetchLogs();
    } catch (err) {
      setTestResult({
        error: err.message || "Lỗi kết nối API",
      });
    } finally {
      setTesting(false);
    }
  };

  const currentHost = typeof window !== "undefined" ? window.location.hostname : "192.168.1.161";
  const apiSampleUrl = `http://${currentHost}:8000/api/?key=${settings.key}&macid=24:6F:28:AB:CD:EF&timestamp=${Math.floor(Date.now() / 1000)}`;

  // Tài liệu API gửi đối tác
  const apiDocContent = `TÀI LIỆU KỸ THUẬT: API KHÓA CỬA & QUẢN LÝ THẺ TỪ (RFID)
Hệ Thống WorkShiftPro - Cổng API IoT Door Lock
===================================================================

1. ĐỊA CHỈ MÁY CHỦ (BASE URL):
   http://${currentHost}:8000
   (Mã bảo mật hệ thống: key = "${settings.key}")

-------------------------------------------------------------------
2. API THÊM THẺ MỚI (ADD / UPDATE CARD)
-------------------------------------------------------------------
Cách 1: Gửi qua RESTful POST (JSON) - Khuyến nghị cho Web / App
   Endpoint: POST http://${currentHost}:8000/api/cards
   Headers:  Content-Type: application/json
   Body JSON:
   {
     "key": "${settings.key}",
     "card_uid": "E2806894",
     "card_holder": "Nguyễn Văn A",
     "note": "Nhân viên ca sáng",
     "is_active": 1
   }

Cách 2: Gửi nhanh qua GET URL (Dễ dùng cho ESP8266, Webhook, trình duyệt)
   Endpoint:
   GET http://${currentHost}:8000/api/cards/add?key=${settings.key}&card_uid=E2806894&card_holder=Nguyen+Van+A&note=Ca+sang

Phản hồi thành công (HTTP 201 hoặc 200):
   {
     "success": true,
     "action": "created",
     "message": "Đã thêm thẻ mới 'E2806894' (Nguyễn Văn A) vào hệ thống thành công.",
     "card": {
       "id": 1,
       "card_uid": "E2806894",
       "card_holder": "Nguyễn Văn A",
       "is_active": 1,
       "note": "Nhân viên ca sáng",
       "created_at": "2026-11-18 17:30:00"
     }
   }

-------------------------------------------------------------------
3. API XÓA THẺ (DELETE CARD)
-------------------------------------------------------------------
Cách 1: Gửi qua RESTful DELETE
   Endpoint: DELETE http://${currentHost}:8000/api/cards/E2806894?key=${settings.key}

Cách 2: Gửi qua GET URL
   Endpoint: GET http://${currentHost}:8000/api/cards/delete?key=${settings.key}&card_uid=E2806894

Phản hồi khi xóa thành công (HTTP 200):
   {
     "success": true,
     "message": "Đã xóa thẻ 'E2806894' (Nguyễn Văn A) thành công khỏi hệ thống.",
     "deleted_card": {
       "card_uid": "E2806894",
       "card_holder": "Nguyễn Văn A"
     }
   }

-------------------------------------------------------------------
4. API LẤY DANH SÁCH THẺ (GET CARDS LIST)
-------------------------------------------------------------------
   Endpoint: GET http://${currentHost}:8000/api/cards?key=${settings.key}
   (Hỗ trợ tìm kiếm: ?key=${settings.key}&search=Nguyen)

Phản hồi:
   {
     "success": true,
     "total": 1,
     "cards": [
       {
         "id": 1,
         "card_uid": "E2806894",
         "card_holder": "Nguyễn Văn A",
         "is_active": 1,
         "note": "Nhân viên ca sáng",
         "created_at": "2026-11-18 17:30:00"
       }
     ]
   }

-------------------------------------------------------------------
5. API TẠM KHÓA / MỞ KHÓA THẺ (TOGGLE CARD STATUS)
-------------------------------------------------------------------
   Endpoint: GET http://${currentHost}:8000/api/cards/toggle?key=${settings.key}&card_uid=E2806894
   (Chuyển đổi linh hoạt giữa Hoạt động (1) và Tạm khóa (0) khi nhân viên làm mất thẻ)

-------------------------------------------------------------------
6. API XÁC THỰC MỞ CỬA KHI QUẸT THẺ (VERIFY / UNLOCK)
-------------------------------------------------------------------
   Dành cho thiết bị đọc thẻ (ESP8266 + RC522) gửi khi có người quẹt thẻ:
   GET http://${currentHost}:8000/api/?key=${settings.key}&macid={MAC_ADDRESS}&timestamp={TIMESTAMP}&card_uid={CARD_UID}

Kết quả phản hồi:
   - Thẻ HỢP LỆ (Mở cửa):
     {
       "success": true,
       "status": "unlock",
       "access": "granted",
       "relay": 1,
       "duration_seconds": 5,
       "card_uid": "E2806894",
       "card_holder": "Nguyễn Văn A",
       "message": "Quẹt thẻ thành công: Nguyễn Văn A (UID: E2806894). Cho phép mở cửa!"
     }

   - Thẻ CHƯA ĐĂNG KÝ hoặc ĐANG BỊ KHÓA (Từ chối):
     {
       "success": false,
       "status": "denied",
       "access": "denied",
       "message": "Thẻ chưa được đăng ký trong hệ thống (UID: ...)"
     }
===================================================================`;

  // Mã C++ mẫu cho ESP8266 + RC522 RFID
  const esp8266Code = `/*
 * =========================================================================
 * WORKSHIFTPRO - ESP8266 SMART DOOR LOCK & RFID CONTROLLER
 * Tự động đồng bộ với Server Backend: http://${currentHost}:8000/api/
 * Key xác thực: "${settings.key}"
 * =========================================================================
 * 
 * SƠ ĐỒ KẾT NỐI PHẦN CỨNG (WIRING):
 * 1. Module Relay 1 kênh (Kích chốt điện từ 12V):
 *    - VCC  ---> Chân VIN (5V) của ESP8266
 *    - GND  ---> Chân GND của ESP8266
 *    - IN   ---> Chân D1 (GPIO 5) của ESP8266
 * 2. Module Đọc Thẻ RFID RC522 (Giao tiếp SPI):
 *    - 3.3V ---> Chân 3V3 của ESP8266 (LƯU Ý: Không nối vào 5V)
 *    - RST  ---> Chân D3 (GPIO 0)
 *    - GND  ---> Chân GND
 *    - MISO ---> Chân D6 (GPIO 12 - MISO)
 *    - MOSI ---> Chân D7 (GPIO 13 - MOSI)
 *    - SCK  ---> Chân D5 (GPIO 14 - SCK)
 *    - SDA  ---> Chân D4 (GPIO 2 - SS/CS)
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

// 1. CẤU HÌNH WI-FI
const char* WIFI_SSID     = "TEN_WIFI_CUA_BAN";
const char* WIFI_PASSWORD = "MAT_KHAU_WIFI";

// 2. CẤU HÌNH SERVER & KHÓA BẢO MẬT
const char* SERVER_HOST   = "${currentHost}";
const int   SERVER_PORT   = 8000;
const char* SECRET_KEY    = "${settings.key}";

// 3. CHÂN RELAY & RC522
const int RELAY_PIN       = D1; // GPIO 5
const int SS_PIN          = D4; // GPIO 2
const int RST_PIN         = D3; // GPIO 0
const int UNLOCK_DELAY_MS = ${settings.relay_duration * 1000};

MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\\n=== KHOI DONG HE THONG KHOA CUA ESP8266 + RFID ===");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); // Mặc định tắt relay (Loại kích mức LOW)

  SPI.begin();
  rfid.PCD_Init();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWi-Fi da ket noi! IP: " + WiFi.localIP().toString());
  Serial.println("Dia chi MAC: " + WiFi.macAddress());
  Serial.println("San sang quet the RFID...");
}

void loop() {
  // Kiem tra co the dat vao dau doc
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // Doc ma UID cua the
  String cardUid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) cardUid += "0";
    cardUid += String(rfid.uid.uidByte[i], HEX);
  }
  cardUid.toUpperCase();
  Serial.println("\\n>>> Da quet the UID: " + cardUid);

  sendVerifyRequest(cardUid);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1000);
}

void sendVerifyRequest(String cardUid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Mat ket noi Wi-Fi!");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  String mac = WiFi.macAddress();
  unsigned long ts = millis() / 1000;
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + 
               "/api/?key=" + String(SECRET_KEY) + 
               "&macid=" + mac + 
               "&timestamp=" + String(ts) + 
               "&card_uid=" + cardUid;

  http.begin(client, url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println("Phan hoi tu Server: " + payload);

    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload);

    const char* status = doc["status"];
    if (String(status) == "unlock") {
      const char* holder = doc["card_holder"];
      Serial.println(">>> XAC THUC HOP LE! MO CUA CHO: " + String(holder ? holder : cardUid));
      unlockDoor();
    } else {
      Serial.println(">>> THE BI TU CHOI HOAC CHUA DANG KY!");
    }
  } else {
    Serial.println("Loi HTTP: " + String(httpCode));
  }
  http.end();
}

void unlockDoor() {
  digitalWrite(RELAY_PIN, LOW); // Bat relay mo chot khoa
  delay(UNLOCK_DELAY_MS);
  digitalWrite(RELAY_PIN, HIGH); // Tat relay dong chot
}
`;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            background: toast.type === "danger" ? "#ef4444" : "#10b981",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {toast.type === "danger" ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                background: "#eff6ff",
                color: "#2563eb",
                padding: "8px 12px",
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Key size={24} />
            </span>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Khóa Cửa Thông Minh & Thẻ Từ (IoT Smart Lock & Cards)
              </h1>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2, marginBottom: 0 }}>
                Quản lý thẻ RFID, xác thực mã khóa & điều khiển Relay mở cửa tự động đồng bộ giữa phần cứng <strong>ESP8266</strong> và <strong>Server</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Nút thao tác nhanh */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => {
              fetchCards(cardSearch);
              fetchLogs();
              showToast("Đã làm mới dữ liệu!");
            }}
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px" }}
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={15} className={loadingLogs || loadingCards ? "spin" : ""} />
            <span>Làm mới</span>
          </button>

          <button
            onClick={handleRemoteUnlock}
            disabled={remoteUnlocking}
            className="btn btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              fontWeight: 800,
              background: isUnlockedEffect
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
            }}
          >
            {isUnlockedEffect ? <Unlock size={17} /> : <Lock size={17} />}
            <span>{remoteUnlocking ? "Đang gửi lệnh..." : isUnlockedEffect ? "Đang Mở Khóa!" : "Mở Khóa Từ Xa (Test)"}</span>
          </button>
        </div>
      </div>

      {/* Grid 3 Thẻ Tổng Quan */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Card 1: Quản lý Thẻ */}
        <div className="card" style={{ padding: 18, borderLeft: "4px solid #3b82f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
              💳 Thẻ Từ Trong Hệ Thống
            </span>
            <span
              style={{
                background: "#eff6ff",
                color: "#2563eb",
                padding: "2px 8px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {cards.filter((c) => c.is_active === 1).length} Đang hoạt động
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{cards.length}</span>
            <span style={{ fontSize: 12, color: "#64748b" }}>thẻ đã cấp</span>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11.5 }}>
            <span style={{ color: "#16a34a", fontWeight: 700 }}>
              ✓ {cards.filter((c) => c.is_active === 1).length} Cho phép mở
            </span>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>
              ✕ {cards.filter((c) => c.is_active === 0).length} Đã tạm khóa
            </span>
          </div>
        </div>

        {/* Card 2: Key & Định dạng URL */}
        <div className="card" style={{ padding: 18, borderLeft: "4px solid #10b981" }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
            🔑 Mã Khóa & Thời Gian Relay
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 800,
                fontSize: 18,
                color: "#0f172a",
                background: "#f1f5f9",
                padding: "4px 8px",
                borderRadius: 6,
              }}
            >
              {settings.key}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(settings.key);
                setCopiedKey(true);
                showToast("Đã copy mã key!");
                setTimeout(() => setCopiedKey(false), 2000);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: copiedKey ? "#10b981" : "#64748b",
                cursor: "pointer",
                padding: 4,
              }}
              title="Sao chép Key"
            >
              {copiedKey ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
            Thời gian giữ mở chốt Relay: <strong>{settings.relay_duration} giây</strong>
          </div>
        </div>

        {/* Card 3: Thống kê mở cửa */}
        <div className="card" style={{ padding: 18, borderLeft: "4px solid #8b5cf6" }}>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
            📊 Nhật Ký Quét Khóa Gần Nhất
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{logs.length}</span>
            <span style={{ fontSize: 12, color: "#64748b" }}>lượt ghi nhận</span>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11.5 }}>
            <span style={{ color: "#16a34a", fontWeight: 700 }}>
              ✓ {logs.filter((l) => l.status === "granted").length} Thành công
            </span>
            <span style={{ color: "#dc2626", fontWeight: 700 }}>
              ✕ {logs.filter((l) => l.status === "denied").length} Bị từ chối
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Chuyển đổi nội dung */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #e2e8f0",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setActiveSubTab("cards")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeSubTab === "cards" ? "3px solid #2563eb" : "3px solid transparent",
            color: activeSubTab === "cards" ? "#2563eb" : "#64748b",
            fontWeight: 700,
            fontSize: 14,
            padding: "10px 16px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: -2,
          }}
        >
          <CreditCard size={16} />
          <span>Quản Lý Thẻ Từ ({cards.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("docs")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeSubTab === "docs" ? "3px solid #2563eb" : "3px solid transparent",
            color: activeSubTab === "docs" ? "#2563eb" : "#64748b",
            fontWeight: 700,
            fontSize: 14,
            padding: "10px 16px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: -2,
          }}
        >
          <FileText size={16} />
          <span>Tài Liệu API Thêm & Xóa Thẻ (Gửi Đối Tác)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("logs")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeSubTab === "logs" ? "3px solid #2563eb" : "3px solid transparent",
            color: activeSubTab === "logs" ? "#2563eb" : "#64748b",
            fontWeight: 700,
            fontSize: 14,
            padding: "10px 16px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: -2,
          }}
        >
          <Clock size={16} />
          <span>Lịch Sử Quét Khóa ({logs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("esp8266")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeSubTab === "esp8266" ? "3px solid #2563eb" : "3px solid transparent",
            color: activeSubTab === "esp8266" ? "#2563eb" : "#64748b",
            fontWeight: 700,
            fontSize: 14,
            padding: "10px 16px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: -2,
          }}
        >
          <Cpu size={16} />
          <span>Mã C++ (ESP8266 + RC522)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("tester")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeSubTab === "tester" ? "3px solid #2563eb" : "3px solid transparent",
            color: activeSubTab === "tester" ? "#2563eb" : "#64748b",
            fontWeight: 700,
            fontSize: 14,
            padding: "10px 16px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: -2,
          }}
        >
          <Send size={16} />
          <span>Kiểm Tra Trực Tiếp (API Simulator)</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveSubTab("settings")}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeSubTab === "settings" ? "3px solid #2563eb" : "3px solid transparent",
              color: activeSubTab === "settings" ? "#2563eb" : "#64748b",
              fontWeight: 700,
              fontSize: 14,
              padding: "10px 16px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: -2,
            }}
          >
            <Sliders size={16} />
            <span>Đổi Mã Key & Cài Đặt</span>
          </button>
        )}
      </div>

      {/* ================= TAB 1: QUẢN LÝ THẺ TỪ (RFID CARDS) ================= */}
      {activeSubTab === "cards" && (
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px 0", color: "#0f172a" }}>
                Danh Sách Thẻ Khóa Cửa (RFID / NFC Cards)
              </h3>
              <p style={{ fontSize: 12.5, color: "#64748b", margin: 0 }}>
                Quản lý mã thẻ, chủ sở hữu thẻ và quyền mở cửa. Thẻ được lưu trực tiếp trên Server và đồng bộ ngay lập tức.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Tìm theo UID, tên chủ thẻ..."
                  value={cardSearch}
                  onChange={(e) => {
                    setCardSearch(e.target.value);
                    fetchCards(e.target.value);
                  }}
                  className="form-control"
                  style={{
                    paddingLeft: 32,
                    fontSize: 13,
                    width: 220,
                  }}
                />
                <Search size={14} color="#94a3b8" style={{ position: "absolute", left: 10, top: 11 }} />
              </div>

              <button
                onClick={() => setShowAddCardModal(true)}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", fontWeight: 700 }}
              >
                <Plus size={16} />
                <span>Thêm Thẻ Mới</span>
              </button>
            </div>
          </div>

          {/* Bảng Danh Sách Thẻ */}
          {cards.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
              <CreditCard size={42} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: "#64748b" }}>Chưa có thẻ nào trong hệ thống</div>
              <p style={{ fontSize: 13, margin: "6px 0 16px 0" }}>
                Bấm nút "Thêm Thẻ Mới" ở trên hoặc dùng API để đăng ký thẻ từ cho nhân sự.
              </p>
              <button
                onClick={() => setShowAddCardModal(true)}
                className="btn btn-primary btn-sm"
              >
                + Thêm Thẻ Đầu Tiên
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Mã Thẻ (UID)</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Tên Chủ Thẻ</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Trạng Thái</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Ghi Chú</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Ngày Cấp Thẻ</th>
                    <th style={{ padding: "10px 12px", color: "#475569", textAlign: "right" }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => {
                    const isActive = card.is_active === 1;
                    return (
                      <tr
                        key={card.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: isActive ? "#ffffff" : "#fef2f2",
                        }}
                      >
                        <td style={{ padding: "12px", fontFamily: "monospace", fontWeight: 800, color: "#1e293b" }}>
                          <span
                            style={{
                              background: "#f1f5f9",
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #e2e8f0",
                            }}
                          >
                            {card.card_uid}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontWeight: 700, color: "#0f172a" }}>
                          {card.card_holder || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Chưa đặt tên</span>}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {isActive ? (
                            <span
                              style={{
                                background: "#dcfce7",
                                color: "#15803d",
                                padding: "4px 10px",
                                borderRadius: 99,
                                fontSize: 11.5,
                                fontWeight: 800,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <UserCheck size={13} /> Đang hoạt động
                            </span>
                          ) : (
                            <span
                              style={{
                                background: "#fee2e2",
                                color: "#b91c1c",
                                padding: "4px 10px",
                                borderRadius: 99,
                                fontSize: 11.5,
                                fontWeight: 800,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <UserX size={13} /> Đã khóa thẻ
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px", color: "#64748b", maxWidth: 220 }}>
                          {card.note || "—"}
                        </td>
                        <td style={{ padding: "12px", color: "#64748b", fontSize: 12 }}>
                          {card.created_at ? card.created_at.replace("T", " ").substring(0, 19) : "—"}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={() => handleToggleCard(card)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: 12,
                                padding: "5px 10px",
                                color: isActive ? "#b91c1c" : "#15803d",
                              }}
                              title={isActive ? "Tạm khóa thẻ này" : "Mở khóa thẻ"}
                            >
                              {isActive ? "Khóa thẻ" : "Mở khóa"}
                            </button>

                            <button
                              onClick={() => handleDeleteCard(card)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: 12,
                                padding: "5px 8px",
                                color: "#ef4444",
                                borderColor: "#fecaca",
                              }}
                              title="Xóa thẻ khỏi hệ thống"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL THÊM THẺ MỚI */}
      {showAddCardModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 480,
              padding: 24,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#0f172a" }}>
                ➕ Thêm Thẻ Khóa Cửa Mới
              </h3>
              <button
                onClick={() => setShowAddCardModal(false)}
                style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCardSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#334155" }}>
                  Mã Thẻ (Card UID) (*):
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: E2806894 hoặc A1B2C3D4"
                  value={newCardForm.card_uid}
                  onChange={(e) => setNewCardForm({ ...newCardForm, card_uid: e.target.value.toUpperCase() })}
                  className="form-control"
                  style={{ fontFamily: "monospace", fontWeight: 700 }}
                  autoFocus
                />
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  Mã UID quét từ thẻ RFID RC522 hoặc thẻ chip NFC.
                </span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#334155" }}>
                  Tên Người Sở Hữu / Chủ Thẻ:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn An, Thẻ Dự Phòng 01..."
                  value={newCardForm.card_holder}
                  onChange={(e) => setNewCardForm({ ...newCardForm, card_holder: e.target.value })}
                  className="form-control"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#334155" }}>
                  Ghi Chú:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Ca trực sáng, Học viên thực tập..."
                  value={newCardForm.note}
                  onChange={(e) => setNewCardForm({ ...newCardForm, note: e.target.value })}
                  className="form-control"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: "#334155" }}>
                  Trạng Thái:
                </label>
                <select
                  value={newCardForm.is_active}
                  onChange={(e) => setNewCardForm({ ...newCardForm, is_active: Number(e.target.value) })}
                  className="form-control"
                >
                  <option value={1}>Cho phép mở cửa (Hoạt động)</option>
                  <option value={0}>Tạm khóa (Không cho mở cửa)</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddCardModal(false)}
                  className="btn btn-secondary"
                  disabled={savingCard}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingCard}
                  style={{ fontWeight: 700 }}
                >
                  {savingCard ? "Đang lưu thẻ..." : "Lưu Thẻ Vào Hệ Thống"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= TAB 2: TÀI LIỆU API GỬI ĐỐI TÁC ================= */}
      {activeSubTab === "docs" && (
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px 0", color: "#0f172a" }}>
                📄 Tài Liệu API Thêm & Xóa Thẻ (Dành Cho Lập Trình Viên / Đối Tác)
              </h3>
              <p style={{ fontSize: 12.5, color: "#64748b", margin: 0 }}>
                Bạn có thể bấm nút sao chép bên phải để gửi ngay toàn bộ bản tài liệu hướng dẫn kỹ thuật này qua Zalo, Email hoặc Telegram.
              </p>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(apiDocContent);
                setCopiedDoc(true);
                showToast("Đã sao chép toàn bộ tài liệu API vào Clipboard!");
                setTimeout(() => setCopiedDoc(false), 2500);
              }}
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                fontWeight: 800,
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
              }}
            >
              {copiedDoc ? <Check size={16} /> : <Copy size={16} />}
              <span>{copiedDoc ? "Đã Sao Chép Tài Liệu!" : "📋 Sao Chép Tài Liệu Gửi Đối Tác"}</span>
            </button>
          </div>

          <pre
            style={{
              background: "#0f172a",
              color: "#f8fafc",
              padding: 20,
              borderRadius: 12,
              fontSize: 12.5,
              lineHeight: 1.6,
              overflowX: "auto",
              fontFamily: "Consolas, Monaco, monospace",
              maxHeight: 600,
            }}
          >
            <code>{apiDocContent}</code>
          </pre>
        </div>
      )}

      {/* ================= TAB 3: NHẬT KÝ QUÉT KHÓA ================= */}
      {activeSubTab === "logs" && (
        <div className="card" style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                Nhật Ký Quét Khóa Cửa (Thời Gian Thực)
              </h3>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                <span>Tự động làm mới (6s)</span>
              </label>
            </div>

            {isAdmin && logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="btn btn-secondary btn-sm"
                style={{ color: "#ef4444", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Trash2 size={13} />
                <span>Xóa sạch lịch sử</span>
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
              <Clock size={40} style={{ marginBottom: 8, opacity: 0.6 }} />
              <div>Chưa có nhật ký quét khóa nào được ghi nhận.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Thời gian</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Thiết bị (MAC ID)</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Thẻ (UID / Người quẹt)</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Mã Key Dùng</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Trạng thái</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Địa chỉ IP</th>
                    <th style={{ padding: "10px 12px", color: "#475569" }}>Ghi chú / Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isGranted = log.status === "granted";
                    return (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: isGranted ? "#ffffff" : "#fff5f5",
                        }}
                      >
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "#64748b" }}>
                          {log.created_at ? log.created_at.replace("T", " ").substring(0, 19) : "Vừa xong"}
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 700, color: "#1e293b" }}>
                          {log.macid}
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                          {log.card_uid ? (
                            <div>
                              <span style={{ fontFamily: "monospace", color: "#2563eb", background: "#eff6ff", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                                {log.card_uid}
                              </span>
                              {log.card_holder && (
                                <div style={{ fontSize: 11.5, color: "#334155", marginTop: 2 }}>
                                  👤 {log.card_holder}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>— (Mở qua Key)</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#475569" }}>
                          {log.key_used ? `${log.key_used.slice(0, 4)}...${log.key_used.slice(-4)}` : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {isGranted ? (
                            <span
                              style={{
                                background: "#dcfce7",
                                color: "#15803d",
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <CheckCircle2 size={13} /> MỞ KHÓA THÀNH CÔNG
                            </span>
                          ) : (
                            <span
                              style={{
                                background: "#fee2e2",
                                color: "#b91c1c",
                                padding: "3px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <XCircle size={13} /> TỪ CHỐI
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#64748b", fontSize: 12 }}>
                          {log.ip_address || "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#334155" }}>
                          {log.message || (isGranted ? "Lệnh mở Relay: UNLOCK" : "Từ chối")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 4: MÃ NGUỒN ESP8266 & SƠ ĐỒ ================= */}
      {activeSubTab === "esp8266" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px 0", color: "#0f172a" }}>
              🔌 Sơ Đồ Đấu Nối Phần Cứng (ESP8266 + RFID RC522 + Relay)
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#2563eb", marginBottom: 6 }}>1. Module Relay 1 Kênh 5V</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#334155", lineHeight: 1.6 }}>
                  <li><strong>VCC</strong> nối vào chân <strong>VIN (hoặc 5V)</strong> trên ESP8266.</li>
                  <li><strong>GND</strong> nối vào chân <strong>GND</strong> trên ESP8266.</li>
                  <li><strong>IN</strong> nối vào chân <strong>D1 (GPIO 5)</strong> trên ESP8266.</li>
                </ul>
              </div>

              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#8b5cf6", marginBottom: 6 }}>2. Module Đầu Đọc Thẻ RFID RC522 (SPI)</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#334155", lineHeight: 1.6 }}>
                  <li><strong>3.3V</strong> nối chân <strong>3V3</strong> (Không cấp 5V).</li>
                  <li><strong>RST</strong> nối chân <strong>D3 (GPIO 0)</strong>.</li>
                  <li><strong>SDA (SS)</strong> nối chân <strong>D4 (GPIO 2)</strong>.</li>
                  <li><strong>SCK, MISO, MOSI</strong> nối <strong>D5, D6, D7</strong>.</li>
                </ul>
              </div>

              <div style={{ background: "#f8fafc", padding: 14, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#059669", marginBottom: 6 }}>3. Khóa Cổng / Chốt Điện Từ 12V</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#334155", lineHeight: 1.6 }}>
                  <li>Nguồn 12V (+) nối vào 1 dây của Khóa cửa.</li>
                  <li>Dây còn lại của Khóa cửa nối vào cổng <strong>NO</strong> của Relay.</li>
                  <li>Cổng <strong>COM</strong> của Relay nối về cực âm (-) nguồn 12V.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                  Mã Nguồn C++ Hoàn Chỉnh (ESP8266 + RC522)
                </h3>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  Nạp trực tiếp qua phần mềm Arduino IDE.
                </span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(esp8266Code);
                  setCopiedCode(true);
                  showToast("Đã sao chép toàn bộ mã nguồn C++!");
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="btn btn-secondary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
              >
                {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedCode ? "Đã copy mã" : "Sao chép mã C++"}</span>
              </button>
            </div>

            <pre
              style={{
                background: "#0f172a",
                color: "#e2e8f0",
                padding: 16,
                borderRadius: 10,
                fontSize: 12,
                lineHeight: 1.5,
                overflowX: "auto",
                maxHeight: 520,
                fontFamily: "Consolas, Monaco, monospace",
              }}
            >
              <code>{esp8266Code}</code>
            </pre>
          </div>
        </div>
      )}

      {/* ================= TAB 5: TEST API SIMULATOR ================= */}
      {activeSubTab === "tester" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px 0", color: "#0f172a" }}>
            Trình Giả Lập Gửi Request & Quẹt Thẻ (API Simulator)
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Thử nghiệm trực tiếp request gửi lên hệ thống giống hệt như một chiếc khóa cửa ESP8266 quét thẻ hoặc gửi HTTP request.
          </p>

          <form onSubmit={handleRunTest} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Mã Khóa (Key):
              </label>
              <input
                type="text"
                className="form-control"
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                placeholder="Nhập mã key (ví dụ: 09vjh9KZDp5t)"
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Địa Chỉ MAC ID (macid):
              </label>
              <input
                type="text"
                className="form-control"
                value={testMac}
                onChange={(e) => setTestMac(e.target.value)}
                placeholder="VD: 24:6F:28:AB:CD:EF hoặc DOOR_GATE_01"
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Mã Thẻ Quẹt (card_uid - Tùy chọn để test quẹt thẻ):
              </label>
              <input
                type="text"
                className="form-control"
                value={testCardUid}
                onChange={(e) => setTestCardUid(e.target.value.toUpperCase())}
                placeholder="VD: E2806894 hoặc để trống nếu chỉ test lệnh mở khóa cơ bản"
              />
              <span style={{ fontSize: 11, color: "#64748b" }}>
                Nếu nhập mã thẻ đã thêm trong mục "Quản Lý Thẻ", hệ thống sẽ xác thực mở cửa và ghi nhận tên người quẹt.
              </span>
            </div>

            <div>
              <button
                type="submit"
                disabled={testing}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 20px" }}
              >
                <Send size={15} />
                <span>{testing ? "Đang gửi request..." : "Gửi Request Kiểm Tra"}</span>
              </button>
            </div>
          </form>

          {/* Hiển thị kết quả Test */}
          {testResult && (
            <div style={{ marginTop: 24, borderTop: "1px dashed #cbd5e1", paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>
                Phản Hồi Trả Về Từ Server (JSON Response):
              </div>
              <pre
                style={{
                  background: testResult.data?.success ? "#f0fdf4" : "#fef2f2",
                  border: `1.5px solid ${testResult.data?.success ? "#86efac" : "#fca5a5"}`,
                  color: testResult.data?.success ? "#166534" : "#991b1b",
                  padding: 14,
                  borderRadius: 8,
                  fontSize: 12.5,
                  overflowX: "auto",
                  fontFamily: "monospace",
                }}
              >
                {JSON.stringify(testResult.data || testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 6: CÀI ĐẶT MÃ KEY ================= */}
      {activeSubTab === "settings" && isAdmin && (
        <div className="card" style={{ padding: 20, maxWidth: 640 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px 0", color: "#0f172a" }}>
            Cấu Hình Hệ Thống Khóa Cửa
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Thay đổi mã bảo mật bí mật (secret key) hoặc thời gian đóng/mở Relay điều khiển chốt khóa.
          </p>

          <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Mã Khóa Bí Mật Mới (Secret Key):
              </label>
              <input
                type="text"
                className="form-control"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                required
              />
              <span style={{ fontSize: 11, color: "#64748b" }}>
                Mã mặc định ban đầu là: <code>{settings.default_key}</code>
              </span>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Thời Gian Giữ Mở Relay (giây):
              </label>
              <input
                type="number"
                min="1"
                max="60"
                className="form-control"
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
                required
              />
              <span style={{ fontSize: 11, color: "#64748b" }}>
                Thời gian cấp điện nhả chốt khóa trước khi khóa tự đóng lại (Khuyến nghị: 3 - 5 giây).
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                type="submit"
                disabled={savingSettings}
                className="btn btn-primary"
                style={{ padding: "8px 20px", fontWeight: 700 }}
              >
                {savingSettings ? "Đang lưu..." : "Lưu Cài Đặt Khóa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
