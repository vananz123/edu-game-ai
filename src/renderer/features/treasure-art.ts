// Built-in treasure artwork. Everything is inline SVG/CSS so saved games stay
// fully offline and `.egame` files never need to carry large image payloads.

const TREASURE_BACKGROUND_IDS = ['temple', 'forest', 'ice', 'desert', 'ocean', 'space'];
const TREASURE_CHARACTER_IDS = ['explorer', 'scientist', 'biologist', 'astronaut', 'diver'];

const TREASURE_BACKGROUNDS = {
  temple: {
    label: 'Ngôi đền tri thức',
    short: 'Đền cổ',
    svg: `<svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect width="1200" height="420" fill="#151832"/>
      <circle cx="970" cy="88" r="48" fill="#f5d58b" opacity=".48"/>
      <circle cx="970" cy="88" r="78" fill="#f5d58b" opacity=".08"/>
      <path d="M0 320 160 255 330 305 510 240 720 300 940 250 1200 318V420H0Z" fill="#1c2242"/>
      <path d="M0 360 220 310 430 350 650 305 880 348 1080 322 1200 344V420H0Z" fill="#151a34"/>
      <path d="M430 330V188H770V330" fill="#2a3158"/>
      <path d="M398 190 600 84 802 190Z" fill="#3d4677"/>
      <path d="M424 190H776L600 104Z" fill="#4a5388" opacity=".55"/>
      <rect x="470" y="212" width="28" height="118" fill="#444d80"/>
      <rect x="702" y="212" width="28" height="118" fill="#444d80"/>
      <rect x="520" y="228" width="160" height="102" rx="4" fill="#171c39"/>
      <path d="M540 310V252H580V310M620 310V252H660V310" stroke="#6d76ab" stroke-width="5" fill="none"/>
      <path d="M0 400Q260 374 520 398T1040 394T1200 402V420H0Z" fill="#0f1328"/>
      <path d="M96 350 120 250 144 350Z" fill="#1f2a42"/>
      <path d="M1052 346 1080 238 1108 346Z" fill="#1f2a42"/>
    </svg>`
  },
  forest: {
    label: 'Rừng nhiệt đới',
    short: 'Rừng xanh',
    svg: `<svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect width="1200" height="420" fill="#122c2b"/>
      <circle cx="982" cy="82" r="38" fill="#c8f0c1" opacity=".55"/>
      <path d="M0 310 150 235 300 292 470 220 650 286 830 226 1010 282 1200 232V420H0Z" fill="#173b35"/>
      <path d="M0 360 180 315 380 358 580 300 790 356 980 318 1200 350V420H0Z" fill="#0f2c2a"/>
      <path d="M90 350V204M130 350V170M170 350V225" stroke="#4f6d4b" stroke-width="16"/>
      <circle cx="128" cy="162" r="82" fill="#255845"/><circle cx="82" cy="204" r="54" fill="#2c6951"/>
      <circle cx="176" cy="208" r="58" fill="#1f4c3e"/>
      <path d="M1000 352V198M1050 352V158M1100 352V218" stroke="#496a49" stroke-width="18"/>
      <circle cx="1048" cy="145" r="94" fill="#1d513f"/><circle cx="994" cy="205" r="62" fill="#28654d"/>
      <circle cx="1108" cy="208" r="68" fill="#214b3d"/>
      <path d="M360 398Q420 330 500 390M760 404Q822 342 904 402" stroke="#7bc79b" stroke-width="3" fill="none" opacity=".45"/>
      <circle cx="430" cy="128" r="3" fill="#d2ff9f"/><circle cx="520" cy="184" r="2.4" fill="#d2ff9f"/>
      <circle cx="720" cy="126" r="2.8" fill="#d2ff9f"/><circle cx="872" cy="178" r="2.2" fill="#d2ff9f"/>
      <circle cx="640" cy="86" r="2.5" fill="#d2ff9f"/><circle cx="250" cy="112" r="2.2" fill="#d2ff9f"/>
    </svg>`
  },
  ice: {
    label: 'Hang băng cổ',
    short: 'Băng tuyết',
    svg: `<svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect width="1200" height="420" fill="#101d38"/>
      <path d="M0 128Q190 54 390 118T790 96T1200 142V0H0Z" fill="#2a5c86" opacity=".42"/>
      <path d="M0 154Q220 92 430 146T860 118T1200 168V0H0Z" fill="#54c8c0" opacity=".18"/>
      <circle cx="940" cy="92" r="42" fill="#d9f6ff" opacity=".62"/>
      <path d="M0 330 180 210 320 300 470 170 640 306 810 214 980 304 1200 190V420H0Z" fill="#1b3457"/>
      <path d="M0 370 200 284 360 356 540 246 700 356 880 292 1060 364 1200 300V420H0Z" fill="#122744"/>
      <path d="M145 388 230 308 302 388M410 390 490 290 570 390M720 390 806 292 894 390" stroke="#9ae7f3" stroke-width="8" fill="none" opacity=".5"/>
      <path d="M0 400 120 360 240 404 360 368 480 406 600 366 720 404 840 370 960 406 1080 372 1200 404V420H0Z" fill="#d8f7ff" opacity=".28"/>
      <circle cx="310" cy="130" r="3" fill="#ffffff" opacity=".8"/><circle cx="560" cy="88" r="2.2" fill="#ffffff" opacity=".7"/>
      <circle cx="700" cy="156" r="2.6" fill="#ffffff" opacity=".8"/><circle cx="1060" cy="120" r="2.2" fill="#ffffff" opacity=".65"/>
    </svg>`
  },
  desert: {
    label: 'Sa mạc cổ đại',
    short: 'Sa mạc',
    svg: `<svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect width="1200" height="420" fill="#30213a"/>
      <circle cx="950" cy="96" r="58" fill="#ffc978" opacity=".7"/>
      <circle cx="950" cy="96" r="88" fill="#ffc978" opacity=".12"/>
      <path d="M0 300 220 238 430 298 640 240 860 300 1040 252 1200 296V420H0Z" fill="#4a3041"/>
      <path d="M0 352 200 316 410 358 620 312 840 360 1040 322 1200 350V420H0Z" fill="#352333"/>
      <path d="M420 388 570 196 720 388Z" fill="#6b4a4d"/>
      <path d="M560 388 680 238 800 388Z" fill="#5c3e46"/>
      <path d="M470 354 570 214 650 334" stroke="#a97864" stroke-width="3" fill="none" opacity=".55"/>
      <path d="M0 402Q240 380 470 402T940 400T1200 404V420H0Z" fill="#24182b"/>
      <path d="M150 354V286M150 304l-30-24M150 322l34-28" stroke="#8a6950" stroke-width="7" fill="none"/>
      <circle cx="150" cy="270" r="24" fill="#3f6a4a"/>
      <circle cx="126" cy="292" r="15" fill="#4c7d56"/><circle cx="174" cy="290" r="14" fill="#385f45"/>
    </svg>`
  },
  ocean: {
    label: 'Đại dương sâu',
    short: 'Đại dương',
    svg: `<svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect width="1200" height="420" fill="#0b263d"/>
      <path d="M0 120Q140 84 280 120T560 118T840 122T1200 112V0H0Z" fill="#1c5b78" opacity=".55"/>
      <path d="M0 152Q160 116 320 150T640 146T960 152T1200 142V0H0Z" fill="#5ac6c8" opacity=".12"/>
      <circle cx="980" cy="96" r="34" fill="#b8f2df" opacity=".38"/>
      <path d="M0 340Q160 304 320 338T640 336T960 340T1200 332V420H0Z" fill="#123b52"/>
      <path d="M0 382Q180 352 360 380T720 378T1080 382T1200 376V420H0Z" fill="#0a283c"/>
      <path d="M90 390Q160 338 230 390M330 400Q396 354 462 400" stroke="#2b7d86" stroke-width="7" fill="none" opacity=".65"/>
      <path d="M720 398Q770 354 820 398M880 398Q920 360 960 398" stroke="#276f7d" stroke-width="6" fill="none" opacity=".55"/>
      <path d="M780 214q36-30 72 0t72 0" stroke="#74d4cf" stroke-width="4" fill="none" opacity=".4"/>
      <circle cx="280" cy="220" r="12" fill="#7ce0d3" opacity=".35"/>
      <circle cx="350" cy="160" r="6" fill="#7ce0d3" opacity=".4"/>
      <circle cx="470" cy="250" r="8" fill="#7ce0d3" opacity=".28"/>
      <circle cx="610" cy="180" r="5" fill="#7ce0d3" opacity=".4"/>
      <path d="M1000 246q34-26 68 0t68 0" stroke="#5ecfc6" stroke-width="3" fill="none" opacity=".4"/>
      <path d="M1060 340q26 22 52 0" stroke="#5ecfc6" stroke-width="3" fill="none" opacity=".35"/>
    </svg>`
  },
  space: {
    label: 'Trạm không gian',
    short: 'Vũ trụ',
    svg: `<svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect width="1200" height="420" fill="#0d1028"/>
      <circle cx="900" cy="132" r="88" fill="#3f3d86"/>
      <path d="M812 132q88-44 176 0-88 44-176 0Z" fill="#8d8ad8" opacity=".65"/>
      <ellipse cx="900" cy="132" rx="132" ry="22" fill="none" stroke="#b9b5ff" stroke-width="5" opacity=".55" transform="rotate(-14 900 132)"/>
      <circle cx="300" cy="90" r="2.4" fill="#fff"/><circle cx="430" cy="156" r="2" fill="#fff"/>
      <circle cx="560" cy="76" r="2.2" fill="#fff"/><circle cx="680" cy="150" r="1.8" fill="#fff"/>
      <circle cx="1050" cy="84" r="2.2" fill="#fff"/><circle cx="1110" cy="210" r="1.8" fill="#fff"/>
      <circle cx="190" cy="216" r="2" fill="#fff"/><circle cx="760" cy="58" r="1.8" fill="#fff"/>
      <path d="M0 330 220 274 470 328 720 282 960 330 1200 284V420H0Z" fill="#181c3e"/>
      <path d="M0 376 240 344 480 378 720 348 960 380 1200 352V420H0Z" fill="#11142c"/>
      <path d="M1020 300 1090 270" stroke="#8f88e8" stroke-width="4" opacity=".5"/>
      <circle cx="1020" cy="300" r="5" fill="#c8c4ff"/>
      <path d="M124 320h34v26h-34zM134 306h14v14h-14zM118 332h46v8h-46z" fill="#6f7cb6" opacity=".7"/>
      <path d="M230 350h18v20h-18zM222 358h34v7h-34z" fill="#59679c" opacity=".6"/>
    </svg>`
  }
};

const TREASURE_CHARACTERS = {
  explorer: {
    label: 'Nhà thám hiểm',
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle cx="40" cy="40" r="37" fill="#e9b86b" opacity=".18"/>
      <path d="M17 77q4-22 23-22t23 22Z" fill="#9b6a3f"/>
      <path d="M27 56h26l-4 21H31Z" fill="#c8894d"/>
      <circle cx="40" cy="34" r="16" fill="#f2c79b"/>
      <path d="M21 35q3-20 19-20t19 20Z" fill="#7a4d2c"/>
      <path d="M15 37h50v6H15Z" fill="#8f5c34"/>
      <path d="M25 78V59h6v19M49 78V59h6v19" stroke="#6d482a" stroke-width="4"/>
      <path d="M19 53q-8 8-4 19l9-4Z" fill="#6d482a"/>
      <circle cx="34" cy="33" r="1.6" fill="#3c2a1d"/><circle cx="46" cy="33" r="1.6" fill="#3c2a1d"/>
      <path d="M35 41q5 4 10 0" stroke="#9c5d4b" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  scientist: {
    label: 'Nhà khoa học',
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle cx="40" cy="40" r="37" fill="#8db8ff" opacity=".18"/>
      <path d="M16 78q3-24 24-24t24 24Z" fill="#eef5ff"/>
      <path d="M33 55h14l2 23H31Z" fill="#dbeaff"/>
      <path d="M28 58 24 78M52 58l4 20" stroke="#9fb5d6" stroke-width="3"/>
      <circle cx="40" cy="33" r="16" fill="#f0c9a2"/>
      <path d="M24 32q0-18 16-18t16 18q-6-7-16-7t-16 7Z" fill="#3a3145"/>
      <circle cx="34" cy="33" r="4.6" fill="none" stroke="#30465e" stroke-width="1.7"/>
      <circle cx="46" cy="33" r="4.6" fill="none" stroke="#30465e" stroke-width="1.7"/>
      <path d="M38.6 33h2.8M29.4 32l-4 1M50.6 32l4 1" stroke="#30465e" stroke-width="1.6"/>
      <path d="M35 42q5 3 10 0" stroke="#a45e58" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M58 66h10v11H58z" fill="#bfe0ff" opacity=".8"/>
      <path d="M59 66v-5h8v5" stroke="#7fa6cf" stroke-width="2" fill="none"/>
    </svg>`
  },
  biologist: {
    label: 'Nhà sinh vật học',
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle cx="40" cy="40" r="37" fill="#77d0a0" opacity=".2"/>
      <path d="M16 78q3-24 24-24t24 24Z" fill="#3f8f68"/>
      <path d="M33 55h14v23H33Z" fill="#6ab989"/>
      <circle cx="40" cy="33" r="16" fill="#edc79d"/>
      <path d="M24 31q2-17 16-17t16 17Z" fill="#5a3d2b"/>
      <path d="M17 34h46v5H17Z" fill="#2f7b57"/>
      <path d="M53 18q15 2 13 17-14 0-13-17Z" fill="#73c98d"/>
      <path d="M53 35q7-8 13-17" stroke="#2f7b57" stroke-width="2" fill="none"/>
      <circle cx="34" cy="33" r="1.7" fill="#33261b"/><circle cx="46" cy="33" r="1.7" fill="#33261b"/>
      <path d="M35 41q5 4 10 0" stroke="#a45e58" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M25 62q7 6 15 0M45 64q7 6 14 0" stroke="#b8e8cb" stroke-width="2" fill="none" opacity=".7"/>
    </svg>`
  },
  astronaut: {
    label: 'Phi hành gia',
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle cx="40" cy="40" r="37" fill="#a79cff" opacity=".2"/>
      <path d="M14 78q4-25 26-25t26 25Z" fill="#e6e8f4"/>
      <path d="M31 54h18v24H31Z" fill="#c7cce1"/>
      <circle cx="40" cy="32" r="20" fill="#d9ecff"/>
      <circle cx="40" cy="32" r="16" fill="#8ec9ed" opacity=".7"/>
      <path d="M27 31q4-9 13-9t13 9" stroke="#f9fbff" stroke-width="3" fill="none" opacity=".8"/>
      <circle cx="34" cy="32" r="1.8" fill="#22344d"/><circle cx="46" cy="32" r="1.8" fill="#22344d"/>
      <path d="M36 40q4 3 8 0" stroke="#45617c" stroke-width="1.7" fill="none" stroke-linecap="round"/>
      <path d="M22 63h36v7H22Z" fill="#b9c0d8"/>
      <circle cx="58" cy="66" r="4" fill="#8fe6b4"/>
      <path d="M59 18v-6M56 15h6" stroke="#d8d4ff" stroke-width="2"/>
    </svg>`
  },
  diver: {
    label: 'Thám hiểm biển',
    svg: `<svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle cx="40" cy="40" r="37" fill="#55c9d2" opacity=".2"/>
      <path d="M16 78q3-24 24-24t24 24Z" fill="#1d6482"/>
      <path d="M33 55h14v23H33Z" fill="#2b7f9e"/>
      <circle cx="40" cy="33" r="16" fill="#eec59d"/>
      <path d="M24 32q0-17 16-17t16 17Z" fill="#2c2222"/>
      <path d="M20 31h40v13H20Z" fill="#d7f6ff" opacity=".55"/>
      <path d="M20 36h40" stroke="#87dce8" stroke-width="2"/>
      <circle cx="34" cy="35" r="1.7" fill="#26303a"/><circle cx="46" cy="35" r="1.7" fill="#26303a"/>
      <path d="M35 43q5 3 10 0" stroke="#a45e58" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M56 30V15h6v15" stroke="#f2c65e" stroke-width="4" fill="none"/>
      <path d="M22 66q8 5 16 0M44 68q8 5 16 0" stroke="#89e0e5" stroke-width="2" fill="none" opacity=".75"/>
    </svg>`
  }
};

function treasureBackgroundId(value) {
  return TREASURE_BACKGROUND_IDS.includes(String(value)) ? String(value) : 'temple';
}

function treasureCharacterId(value) {
  return TREASURE_CHARACTER_IDS.includes(String(value)) ? String(value) : 'explorer';
}

function treasureBackgroundMeta(value) {
  return TREASURE_BACKGROUNDS[treasureBackgroundId(value)];
}

function treasureCharacterMeta(value) {
  return TREASURE_CHARACTERS[treasureCharacterId(value)];
}

function treasureBackdropHtml(value) {
  const id = treasureBackgroundId(value);
  const meta = TREASURE_BACKGROUNDS[id];
  return `<div class="treasure-backdrop" data-background="${id}" aria-hidden="true">${meta.svg}</div>`;
}

function treasureAvatarHtml(value, extraClass = '') {
  const id = treasureCharacterId(value);
  const meta = TREASURE_CHARACTERS[id];
  return `<span class="treasure-avatar ${extraClass}" data-character="${id}" title="${escapeHtml(meta.label)}">${meta.svg}</span>`;
}

function treasureThemePreviewHtml(backgroundId, characterId) {
  const bg = treasureBackgroundId(backgroundId);
  const ch = treasureCharacterId(characterId);
  const bgMeta = TREASURE_BACKGROUNDS[bg];
  const chMeta = TREASURE_CHARACTERS[ch];
  return `<div class="treasure-theme-preview" data-treasure-preview data-preview-background="${bg}" data-preview-character="${ch}">
    ${treasureBackdropHtml(bg)}
    <div class="treasure-preview-copy">
      ${treasureAvatarHtml(ch, 'is-large')}
      <div><strong>${escapeHtml(bgMeta.label)}</strong><span>${escapeHtml(chMeta.label)}</span></div>
    </div>
  </div>`;
}
