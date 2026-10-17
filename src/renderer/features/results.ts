// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function exportResults() {
  const rows = [['Trò chơi','Người chơi','Điểm','Điểm tối đa','Phần trăm','Ngày']];
  state.db.sessions.forEach(s => rows.push([s.gameTitle,s.playerName,s.points,s.max,s.percent,s.createdAt]));
  const csv = rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url;a.download='edugame-ket-qua.csv';a.click();URL.revokeObjectURL(url);toast('Đã xuất CSV kết quả.');
}
