export default function GuidePage() {
  return (
    <div className="p-6 rounded-lg bg-[#141820] border border-[#222838]">
      <h1 className="text-2xl font-semibold mb-3">Hướng dẫn</h1>
      <ul className="list-disc list-inside space-y-2 text-sm text-gray-300">
        <li>Chế độ Offline: vào mục "Chơi ngay" để chơi 2 người hoặc bật AI.</li>
        <li>Chế độ Online: tạo phòng để nhận mã mời hoặc nhập mã để tham gia.</li>
        <li>Đấu với Máy: chọn độ khó (Skill Level) 0-20.</li>
        <li>Replay: xem lịch sử nước đi ở cột bên phải.</li>
        <li>Tuỳ chỉnh: sẽ bổ sung theme bàn cờ, âm thanh, hiệu ứng.</li>
      </ul>
    </div>
  );
}