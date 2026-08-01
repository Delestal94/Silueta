const j = async (u: string) => { const r = await fetch(u); const t = await r.text(); try { return JSON.parse(t); } catch { return { _html: true, status: r.status }; } };
const K = 'https://www.thesportsdb.com/api/v1/json/3';

// Liverpool squad endpoint
const squad: any = await j(`${K}/lookup_all_players.php?id=133602`);
if (squad._html) { console.log('squad endpoint throttled'); }
else {
  const vd = (squad.player || []).find((p: any) => p.strPlayer.includes('van Dijk'));
  console.log('squad endpoint  -> van Dijk render:', vd?.strRender ?? 'MISSING', '| id', vd?.idPlayer);
  if (vd) {
    await new Promise(r => setTimeout(r, 1500));
    const one: any = await j(`${K}/lookupplayer.php?id=${vd.idPlayer}`);
    console.log('lookupplayer    -> van Dijk render:', one._html ? 'THROTTLED' : (one.players?.[0]?.strRender ?? 'MISSING'));
  }
  const withRender = (squad.player || []).filter((p: any) => p.strRender).length;
  console.log(`squad: ${withRender}/${(squad.player||[]).length} have renders`);
}
