/* ============================================================
   data/cards.js — Kartenpool, Fusionsrezepte, Hilfsfunktionen
   v3.0 — Rassen-System, Evolution-Ketten, keine Level
   ============================================================ */

/* ── Konstanten ── */
const CARD_TYPE = { MONSTER:'monster', SPELL:'spell', TRAP:'trap', FUSION:'fusion', FIELD:'field' };
const RARITY    = { COMMON:'common', UNCOMMON:'uncommon', RARE:'rare', EPIC:'epic', LEGENDARY:'legendary' };

/* ── Rassen-Konstanten ── */
const RACE = {
  KOBOLD:       'Kobold',
  ORK:          'Ork',
  DAEMON:       'Dämon',
  DRACHE:       'Drache',
  UNTOTER:      'Untoter',
  MENSCH:       'Mensch',
  BESTIE:       'Bestie',
  MASCHINE:     'Maschine',
  SCHATTEN:     'Schattenwesen',
  ELEMENTAR:    'Elementar',
};

/* ══════════════════════════════════════════════════
   MONSTER CARDS — sortiert nach Rasse
   Kein "level"-Feld mehr (Tribute deaktiviert)
   race: Rasse für Synergien
   effect: on-summon Effekt
══════════════════════════════════════════════════ */
const MONSTER_CARDS = [

  /* ─── KOBOLD — Schwarm, schwach einzeln, stark in Masse ─── */
  { id:'kobold_jung',      name:'Junger Kobold',      type:'monster', race:'Kobold',       atk:300,  def:150,  effect:null,           rarity:'common',    flavor:'Frech, klein, überall.' },
  { id:'kobold_speer',     name:'Kobold-Speerträger', type:'monster', race:'Kobold',       atk:500,  def:300,  effect:null,           rarity:'common',    flavor:'Gefährlicher in Gruppen.' },
  { id:'goblin',           name:'Kobold-Krieger',     type:'monster', race:'Kobold',       atk:650,  def:400,  effect:null,           rarity:'common',    flavor:'Kampferprobt, dreist.' },
  { id:'kobold_jaeger',    name:'Kobold-Jäger',       type:'monster', race:'Kobold',       atk:600,  def:250,  effect:'burn300',      rarity:'common',    flavor:'Vergiftete Pfeile.' },
  { id:'kobold_hauptmann', name:'Kobold-Hauptmann',   type:'monster', race:'Kobold',       atk:1100, def:650,  effect:'raceBuffATK150', rarity:'uncommon', flavor:'Treibt die Horde voran.' },
  { id:'kobold_koenig',    name:'Kobold-König',       type:'monster', race:'Kobold',       atk:1700, def:950,  effect:'raceBuffATK300', rarity:'rare',     flavor:'Kein Kobold wagt es, ihm zu widersprechen.' },

  /* ─── ORK — Rohe Kraft, hoher ATK ─── */
  { id:'ork_rekrut',       name:'Ork-Rekrut',         type:'monster', race:'Ork',          atk:800,  def:500,  effect:null,           rarity:'common',    flavor:'Roh, wütend, tödlich.' },
  { id:'orc',              name:'Ork-Krieger',        type:'monster', race:'Ork',          atk:1400, def:800,  effect:null,           rarity:'common',    flavor:'Brutal und ungestüm.' },
  { id:'ork_berserker',    name:'Ork-Berserker',      type:'monster', race:'Ork',          atk:1600, def:600,  effect:'buff400',      rarity:'uncommon',  flavor:'Schmerz macht ihn nur stärker.' },
  { id:'ork_schamane',     name:'Ork-Schamane',       type:'monster', race:'Ork',          atk:900,  def:900,  effect:'buffAllAtk300', rarity:'uncommon', flavor:'Ruft die Kraft der Ahnen.' },
  { id:'ork_kriegsherr',   name:'Ork-Kriegsherr',     type:'monster', race:'Ork',          atk:2200, def:1300, effect:'destroy1',     rarity:'rare',      flavor:'Niederlage ist für ihn ein Fremdwort.' },

  /* ─── DÄMON — Drain, Burn, Dark Power ─── */
  { id:'kleiner_daemon',   name:'Kleiner Dämon',      type:'monster', race:'Dämon',        atk:600,  def:450,  effect:null,           rarity:'common',    flavor:'Aus der Hölle gerufen.' },
  { id:'daemon_lakai',     name:'Dämon-Lakai',        type:'monster', race:'Dämon',        atk:900,  def:700,  effect:'burn300',      rarity:'common',    flavor:'Dient treu im Dienst der Finsternis.' },
  { id:'feuerdaemon',      name:'Feuer-Dämon',        type:'monster', race:'Dämon',        atk:1350, def:950,  effect:'burn400',      rarity:'uncommon',  flavor:'Jede Berührung verbrennt.' },
  { id:'cursed_knight',    name:'Verfluchter Ritter', type:'monster', race:'Dämon',        atk:2000, def:1700, effect:'burn600',      rarity:'epic',      flavor:'Jeder Schlag vergiftet die Seele.' },
  { id:'dunkelherr',       name:'Dunkelherr',         type:'monster', race:'Dämon',        atk:2200, def:1600, effect:'drain500',     rarity:'rare',      flavor:'Saugt Leben aus allem, was er berührt.' },

  /* ─── DRACHE — Hohe Stats, Late-Game-Power ─── */
  { id:'drachen_hatchling',name:'Drachen-Junges',     type:'monster', race:'Drache',       atk:700,  def:500,  effect:null,           rarity:'common',    flavor:'Klein, aber sein Feuer wächst.' },
  { id:'eisdrache',        name:'Eisdrache',          type:'monster', race:'Drache',       atk:1800, def:2200, effect:'weaken500',    rarity:'rare',      flavor:'Sein Atem friert alles ein.' },
  { id:'shadowdrake',      name:'Schattendrache',     type:'monster', race:'Drache',       atk:2000, def:1600, effect:'weaken500',    rarity:'epic',      flavor:'Hüllt Feinde in ewige Schwäche.' },
  { id:'dragon',           name:'Feuerdrache',        type:'monster', race:'Drache',       atk:2500, def:2000, effect:'destroy1',     rarity:'epic',      flavor:'Sein Feueratem verbrennt Legionen.' },

  /* ─── UNTOTER — Revival, Graveyard-Play ─── */
  { id:'skelett',          name:'Skelett',            type:'monster', race:'Untoter',      atk:500,  def:350,  effect:null,           rarity:'common',    flavor:'Knochen ohne Leben.' },
  { id:'zombie',           name:'Zombie',             type:'monster', race:'Untoter',      atk:700,  def:450,  effect:null,           rarity:'common',    flavor:'Langsam, aber unermüdlich.' },
  { id:'knochenwachter',   name:'Knochenwächter',     type:'monster', race:'Untoter',      atk:1100, def:1400, effect:'taunt',        rarity:'uncommon',  flavor:'Zieht alle Angriffe auf sich.' },
  { id:'lich',             name:'Lich-Fürst',         type:'monster', race:'Untoter',      atk:1600, def:1200, effect:'drain500',     rarity:'rare',      flavor:'Saugt Lebensenergie aus Feinden.' },
  { id:'todesritter',      name:'Todesritter',        type:'monster', race:'Untoter',      atk:1800, def:1400, effect:'drain500',     rarity:'rare',      flavor:'Wo er geht, folgt der Tod.' },
  { id:'necro',            name:'Nekromant',          type:'monster', race:'Untoter',      atk:1400, def:1000, effect:'graveRevive',  rarity:'rare',      flavor:'Ruft Karten aus dem Jenseits.' },

  /* ─── MENSCH — Balanced, Support, Early Game ─── */
  { id:'dorfbewohner',     name:'Dorfbewohner',       type:'monster', race:'Mensch',       atk:400,  def:300,  effect:null,           rarity:'common',    flavor:'Kein Kämpfer, aber mutig.' },
  { id:'wache',            name:'Stadtwache',         type:'monster', race:'Mensch',       atk:900,  def:1100, effect:null,           rarity:'common',    flavor:'Hält die Linie.' },
  { id:'bogenschutze',     name:'Bogenschütze',       type:'monster', race:'Mensch',       atk:1000, def:600,  effect:'burn400',      rarity:'common',    flavor:'Trifft immer.' },
  { id:'soldier',          name:'Söldner',            type:'monster', race:'Mensch',       atk:1200, def:1000, effect:null,           rarity:'common',    flavor:'Loyaler Kämpfer.' },
  { id:'knight',           name:'Ritter',             type:'monster', race:'Mensch',       atk:1400, def:1200, effect:null,           rarity:'common',    flavor:'Stahlharter Kämpfer.' },
  { id:'priest',           name:'Heiliger Priester',  type:'monster', race:'Mensch',       atk:800,  def:1500, effect:'heal500',      rarity:'common',    flavor:'Sein Segen tröstet die Verwundeten.' },
  { id:'sniper',           name:'Eliteschütze',       type:'monster', race:'Mensch',       atk:1300, def:700,  effect:'burn600',      rarity:'rare',      flavor:'Kein Ziel ist zu weit.' },
  { id:'shieldguard',      name:'Schildwächter',      type:'monster', race:'Mensch',       atk:900,  def:2200, effect:'taunt',        rarity:'rare',      flavor:'Kein Schlag trifft seine Kameraden.' },
  { id:'kreuzritter',      name:'Kreuzritter',        type:'monster', race:'Mensch',       atk:1700, def:1500, effect:'heal800',      rarity:'rare',      flavor:'Kämpft für Licht und Leben.' },

  /* ─── BESTIE — Aggressiv, Geschwindigkeit ─── */
  { id:'wolf',             name:'Wolf',               type:'monster', race:'Bestie',       atk:700,  def:350,  effect:null,           rarity:'common',    flavor:'Immer auf der Jagd.' },
  { id:'riesenbat',        name:'Riesenfledermaus',   type:'monster', race:'Bestie',       atk:600,  def:500,  effect:null,           rarity:'common',    flavor:'Lautlos und tödlich.' },
  { id:'eiswolf',          name:'Eiswolf',            type:'monster', race:'Bestie',       atk:1250, def:700,  effect:'buff300',      rarity:'uncommon',  flavor:'Sein Biss friert das Blut.' },
  { id:'giant',            name:'Steingigant',        type:'monster', race:'Bestie',       atk:1900, def:2100, effect:null,           rarity:'rare',      flavor:'Ein wandelnder Berg.' },
  { id:'bestienherrscher', name:'Bestien-Herrscher',  type:'monster', race:'Bestie',       atk:2100, def:1400, effect:'destroy1',     rarity:'rare',      flavor:'Alle Bestien gehorchen ihm.' },

  /* ─── MASCHINE — DEF-Fokus, Shield ─── */
  { id:'eisenwachter',     name:'Eisenwächter',       type:'monster', race:'Maschine',     atk:800,  def:1600, effect:'taunt',        rarity:'common',    flavor:'Unzerstörbare Hülle.' },
  { id:'golem',            name:'Eisengolem',         type:'monster', race:'Maschine',     atk:2100, def:2400, effect:null,           rarity:'rare',      flavor:'Uraltes Konstrukt aus verbotenem Stahl.' },
  { id:'kampfkanone',      name:'Kampfkanone',        type:'monster', race:'Maschine',     atk:1400, def:1100, effect:'burn600',      rarity:'uncommon',  flavor:'Schuss nach Schuss.' },
  { id:'belagerungsgolem', name:'Belagerungs-Golem',  type:'monster', race:'Maschine',     atk:1900, def:2500, effect:'shield300',    rarity:'rare',      flavor:'Jeder Schlag prallt ab.' },

  /* ─── SCHATTENWESEN — Debuff, Steal, Control ─── */
  { id:'schattenschleicher',name:'Schattenschleicher',type:'monster', race:'Schattenwesen',atk:600,  def:400,  effect:'weaken200',    rarity:'common',    flavor:'Unsichtbar bis zur Gewalt.' },
  { id:'witch',            name:'Dunkle Hexe',        type:'monster', race:'Schattenwesen',atk:1100, def:900,  effect:'buff400',      rarity:'common',    flavor:'Ihre Sprüche entfachen Wildheit.' },
  { id:'schattenklinge',   name:'Schattenklinge',     type:'monster', race:'Schattenwesen',atk:1250, def:750,  effect:'burn400',      rarity:'uncommon',  flavor:'Klingt wie Stille.' },
  { id:'assassin',         name:'Schattenmörder',     type:'monster', race:'Schattenwesen',atk:1700, def:800,  effect:'buff400',      rarity:'rare',      flavor:'Blitzschnell. Tödlich.' },
  { id:'schattenlord',     name:'Schattenlord',       type:'monster', race:'Schattenwesen',atk:2100, def:1700, effect:'stealHand',    rarity:'epic',      flavor:'Nimmt, was ihm gefällt.' },

  /* ─── ELEMENTAR — Burn, Elemental Overload ─── */
  { id:'feuer_geist',      name:'Feuergeist',         type:'monster', race:'Elementar',    atk:800,  def:450,  effect:'burn300',      rarity:'common',    flavor:'Reines Feuer in Form.' },
  { id:'eis_geist',        name:'Eisgeist',           type:'monster', race:'Elementar',    atk:700,  def:900,  effect:'weaken200',    rarity:'common',    flavor:'Kalt. Präzise. Unaufhaltsam.' },
  { id:'sturm_elementar',  name:'Sturm-Elementar',    type:'monster', race:'Elementar',    atk:1300, def:950,  effect:'burn600',      rarity:'uncommon',  flavor:'Der Blitz gehorcht ihm.' },
  { id:'phoenix',          name:'Phönix',             type:'monster', race:'Elementar',    atk:1800, def:1400, effect:'graveRevive',  rarity:'epic',      flavor:'Unsterblich — steigt aus der Asche.' },
  { id:'thundergod',       name:'Donnergott',         type:'monster', race:'Elementar',    atk:2800, def:2200, effect:'destroyAll',   rarity:'legendary', flavor:'Kein Sterblicher widersteht seinen Blitzen.' },
  { id:'chaos_elementar',  name:'Chaos-Elementar',    type:'monster', race:'Elementar',    atk:2300, def:1800, effect:'destroyAll',   rarity:'epic',      flavor:'Alles löst sich in Chaos auf.' },
];

/* ══════════════════════════════════════════════════
   SPELL CARDS
══════════════════════════════════════════════════ */
const SPELL_CARDS = [
  { id:'fireball',     name:'Feuerball',          type:'spell', atk:0, def:0, effect:'burn800',        rarity:'common',    flavor:'800 direkter Schaden.' },
  { id:'kleine_flamme',name:'Kleine Flamme',      type:'spell', atk:0, def:0, effect:'burn400',        rarity:'common',    flavor:'Einfach, aber effektiv.' },
  { id:'lightning',    name:'Kettenblitz',        type:'spell', atk:0, def:0, effect:'burn1200',       rarity:'rare',      flavor:'1200 direkter Schaden.' },
  { id:'hoellenfeuer', name:'Höllenfeuer',        type:'spell', atk:0, def:0, effect:'burn1600',       rarity:'epic',      flavor:'Verbrennt alles.' },
  { id:'heallight',    name:'Heiliges Licht',     type:'spell', atk:0, def:0, effect:'heal1000',       rarity:'common',    flavor:'Stellt 1000 LP wieder her.' },
  { id:'grand_heilt',  name:'Große Heilung',      type:'spell', atk:0, def:0, effect:'heal1500',       rarity:'rare',      flavor:'Stellt 1500 LP wieder her.' },
  { id:'warcry',       name:'Schlachtruf',        type:'spell', atk:0, def:0, effect:'buffAllAtk400',  rarity:'rare',      flavor:'Alle Monster +400 ATK.' },
  { id:'annihilate',   name:'Annihilieren',       type:'spell', atk:0, def:0, effect:'destroyAllSpell',rarity:'epic',     flavor:'Vernichtet alle feindlichen Monster.' },
  { id:'darkinsight',  name:'Dunkle Einsicht',    type:'spell', atk:0, def:0, effect:'draw2',          rarity:'common',    flavor:'Ziehe 2 Karten.' },
  { id:'soulsteal',    name:'Seelenraub',         type:'spell', atk:0, def:0, effect:'drain1000',      rarity:'rare',      flavor:'Stehle 1000 LP vom Gegner.' },
  { id:'ruf_der_toten',name:'Ruf der Toten',      type:'spell', atk:0, def:0, effect:'graveReviveSpell',rarity:'rare',    flavor:'Beschwört das stärkste Monster aus dem Friedhof.' },
  { id:'gedankenraub', name:'Gedankenraub',       type:'spell', atk:0, def:0, effect:'stealHand',      rarity:'epic',     flavor:'Greift tief in den Verstand des Feindes.' },
  { id:'schatten_nebel',name:'Schattennebel',     type:'spell', atk:0, def:0, effect:'weakenAll300',   rarity:'rare',     flavor:'Alle Feinde werden geschwächt.' },
];

/* ══════════════════════════════════════════════════
   TRAP CARDS
══════════════════════════════════════════════════ */
const TRAP_CARDS = [
  { id:'counterstrike', name:'Gegenschlag',     type:'trap', atk:0, def:0, effect:'destroyAttacker',  trigger:'onAttacked', rarity:'rare',     flavor:'Zerstört den angreifenden Feind.' },
  { id:'mirrorforce',   name:'Spiegelkraft',    type:'trap', atk:0, def:0, effect:'destroyAllAtk',    trigger:'onAttacked', rarity:'epic',     flavor:'Alle angreifenden Monster werden zerstört.' },
  { id:'sacredwall',    name:'Heilige Mauer',   type:'trap', atk:0, def:0, effect:'heal800',           trigger:'onAttacked', rarity:'common',   flavor:'Heilt 800 LP wenn angegriffen.' },
  { id:'ragequit',      name:'Panikabwehr',     type:'trap', atk:0, def:0, effect:'negate',            trigger:'onAttacked', rarity:'rare',     flavor:'Negiert einen Angriff vollständig.' },
  { id:'seelenfalle',   name:'Seelenfalle',     type:'trap', atk:0, def:0, effect:'drain500Trap',      trigger:'onAttacked', rarity:'rare',     flavor:'Saugt Energie aus dem Angreifer.' },
  { id:'zeitschloss',   name:'Zeitschloss',     type:'trap', atk:0, def:0, effect:'negateEffect',      trigger:'onAttacked', rarity:'epic',     flavor:'Friert einen Effekt ein.' },
];

/* ══════════════════════════════════════════════════
   FUSION MONSTERS — nur via Fusion/Evolution
══════════════════════════════════════════════════ */
const FUSION_MONSTERS = [
  /* Originale Fusionen */
  { id:'wardragon',       name:'Kriegsdrache',      type:'fusion', race:'Drache',       atk:3000, def:2500, effect:'destroy1',     rarity:'legendary', flavor:'Krieger und Drache — pure Zerstörung.' },
  { id:'grandsorc',       name:'Erz-Zauberin',      type:'fusion', race:'Schattenwesen',atk:2200, def:1900, effect:'heal500',      rarity:'epic',      flavor:'Heilung und Macht.' },
  { id:'ironcolossus',    name:'Eisenkoloss',        type:'fusion', race:'Maschine',     atk:2800, def:2600, effect:null,           rarity:'legendary', flavor:'Unzerstörbar. Unaufhaltsam.' },
  { id:'shadowstalker',   name:'Schattenjäger',      type:'fusion', race:'Schattenwesen',atk:2400, def:1200, effect:'destroy1',     rarity:'epic',      flavor:'Erschaffen aus Finsternis.' },
  { id:'twindragon',      name:'Zwillingsdrache',    type:'fusion', race:'Drache',       atk:3500, def:2800, effect:'burn600',      rarity:'legendary', flavor:'Zwei Drachen — ein Wille.' },
  { id:'chaosknight',     name:'Chaosritter',        type:'fusion', race:'Schattenwesen',atk:2600, def:2300, effect:'buff400',      rarity:'legendary', flavor:'Kein Gesetz. Keine Gnade.' },

  /* Neue Evolution-Fusionen */
  { id:'kobold_imperator',name:'Kobold-Imperator',  type:'fusion', race:'Kobold',       atk:2000, def:1400, effect:'raceBuffATK300',rarity:'legendary',flavor:'Der König aller Kobolde.' },
  { id:'ork_gott',        name:'Ork-Gott',          type:'fusion', race:'Ork',          atk:3200, def:2400, effect:'destroyAll',   rarity:'legendary', flavor:'Die Erde bebt unter seinen Schritten.' },
  { id:'todeslord',       name:'Todeslord',         type:'fusion', race:'Untoter',      atk:2900, def:2500, effect:'massRevive',   rarity:'legendary', flavor:'Tod ist nicht das Ende.' },
  { id:'drachen_kaiser',  name:'Drachen-Kaiser',    type:'fusion', race:'Drache',       atk:3800, def:3200, effect:'destroy1',     rarity:'legendary', flavor:'Der Urgott aller Drachen.' },
  { id:'dunkel_titan',    name:'Dunkel-Titan',      type:'fusion', race:'Schattenwesen',atk:3300, def:2800, effect:'stealField',   rarity:'legendary', flavor:'Stiehlt alles, was er sieht.' },
  { id:'ork_kriegsgott',  name:'Ork-Kriegsgott',    type:'fusion', race:'Ork',          atk:2800, def:2000, effect:'buffAllAtk500', rarity:'legendary',flavor:'Für ihn ist jede Schlacht gewonnen.' },
];

/* ══════════════════════════════════════════════════
   FIELD CARDS — Spielfeld-Karten
   Typ: 'field' — Globale Karten ohne Besitzer.
   fieldEffects: Persistente Effekte die für BEIDE Seiten gelten.
     trigger:'passive'    → Stat-Bonus/Malus, gilt solange Feld aktiv
     trigger:'each_turn'  → LP-Effekt, wird jede Runde angewendet
   image: Wird als Karten-Artwork UND Kampf-Hintergrund verwendet.
══════════════════════════════════════════════════ */
const FIELD_CARDS = [

  { id:'feld_koboldwald', name:'Koboldwald',       type:'field', rarity:'rare',  atk:0, def:0, race:'', image:null,
    fieldEffects:[{type:'statBoost', target:'all',  stat:'atk', amount:250, trigger:'passive'}],
    flavor:'Die Horde erwacht im Schutz des dunklen Waldes.' },

  { id:'feld_vulkan',     name:'Vulkankrater',     type:'field', rarity:'epic',  atk:0, def:0, race:'', image:null,
    fieldEffects:[{type:'burn',      target:'both',              amount:400, trigger:'each_turn'}],
    flavor:'Brodelnde Lava verschluckt alles – Feuer ist Herr hier.' },

  { id:'feld_heilig',     name:'Heiliger Boden',   type:'field', rarity:'rare',  atk:0, def:0, race:'', image:null,
    fieldEffects:[{type:'heal',      target:'both',              amount:600, trigger:'each_turn'}],
    flavor:'Altes Licht heilt die Gerechten und verdammt die Bösen.' },

  { id:'feld_schatten',   name:'Schattenvoid',     type:'field', rarity:'epic',  atk:0, def:0, race:'', image:null,
    fieldEffects:[{type:'drain',     target:'both',              amount:500, trigger:'each_turn'}],
    flavor:'Die Leere verschluckt das Licht — nur die Dunkelheit herrscht.' },

  { id:'feld_toten',      name:'Totensteppe',      type:'field', rarity:'legendary', atk:0, def:0, race:'', image:null,
    fieldEffects:[
      {type:'statBoost', target:'all', stat:'atk', amount:400, trigger:'passive'},
      {type:'debuff',    target:'all', stat:'def', amount:300, trigger:'passive'},
    ],
    flavor:'Zwischen Leben und Tod — hier regieren die Untoten.' },

  { id:'feld_drache',     name:'Drachengipfel',    type:'field', rarity:'legendary', atk:0, def:0, race:'', image:null,
    fieldEffects:[
      {type:'statBoost', target:'all', stat:'atk', amount:500, trigger:'passive'},
      {type:'burn',      target:'both',             amount:500, trigger:'each_turn'},
    ],
    flavor:'Hier thront die älteste Macht — Drachen werden zu Göttern.' },

  { id:'feld_maschine',   name:'Maschinenhölle',   type:'field', rarity:'rare',  atk:0, def:0, race:'', image:null,
    fieldEffects:[{type:'statBoost', target:'all',  stat:'def', amount:400, trigger:'passive'}],
    flavor:'Stahl, Öl und Blut — hier regiert die ewige Maschine.' },

  { id:'feld_bestie',     name:'Wilder Jägerwald', type:'field', rarity:'rare',  atk:0, def:0, race:'', image:null,
    fieldEffects:[{type:'statBoost', target:'all',  stat:'atk', amount:350, trigger:'passive'}],
    flavor:'Die uralten Bäume kennen nur das Gesetz des Stärkeren.' },

  { id:'feld_chaos',      name:'Chaoszone',        type:'field', rarity:'legendary', atk:0, def:0, race:'', image:null,
    fieldEffects:[
      {type:'statBoost', target:'all', stat:'atk', amount:300, trigger:'passive'},
      {type:'burn',      target:'both',             amount:300, trigger:'each_turn'},
    ],
    flavor:'Hier gelten keine Regeln. Alles ist möglich.' },
];

/* ══════════════════════════════════════════════════
   ALLE KARTEN ZUSAMMENGEFASST
══════════════════════════════════════════════════ */
const ALL_CARDS = [...MONSTER_CARDS, ...SPELL_CARDS, ...TRAP_CARDS, ...FIELD_CARDS];

/* ══════════════════════════════════════════════════
   FUSIONSREZEPTE & EVOLUTION-KETTEN
   Evolution: niedrigere Form + Material = nächste Form
   Cross-Race: zwei verschiedene Rassen = mächtiger Fusion
══════════════════════════════════════════════════ */
const FUSION_RECIPES = [
  /* ─── KOBOLD EVOLUTION ─── */
  { mat1:'kobold_jung',      mat2:'kobold_jung',      result:'goblin',          evoChain:true },
  { mat1:'kobold_jung',      mat2:'kobold_speer',     result:'goblin',          evoChain:true },
  { mat1:'goblin',           mat2:'goblin',           result:'kobold_hauptmann',evoChain:true },
  { mat1:'goblin',           mat2:'kobold_jaeger',    result:'kobold_hauptmann',evoChain:true },
  { mat1:'kobold_hauptmann', mat2:'goblin',           result:'kobold_koenig',   evoChain:true },
  { mat1:'kobold_koenig',    mat2:'kobold_hauptmann', result:'kobold_imperator',evoChain:true },

  /* ─── ORK EVOLUTION ─── */
  { mat1:'ork_rekrut',       mat2:'ork_rekrut',       result:'orc',             evoChain:true },
  { mat1:'orc',              mat2:'ork_berserker',    result:'ork_kriegsherr',  evoChain:true },
  { mat1:'orc',              mat2:'orc',              result:'ork_kriegsherr',  evoChain:true },
  { mat1:'ork_kriegsherr',   mat2:'ork_schamane',     result:'ork_kriegsgott',  evoChain:true },

  /* ─── UNTOTER EVOLUTION ─── */
  { mat1:'skelett',          mat2:'zombie',           result:'knochenwachter',  evoChain:true },
  { mat1:'knochenwachter',   mat2:'zombie',           result:'lich',            evoChain:true },
  { mat1:'lich',             mat2:'todesritter',      result:'todeslord',       evoChain:true },
  { mat1:'necro',            mat2:'lich',             result:'todeslord',       evoChain:true },

  /* ─── DRACHEN EVOLUTION ─── */
  { mat1:'drachen_hatchling',mat2:'drachen_hatchling',result:'shadowdrake',     evoChain:true },
  { mat1:'drachen_hatchling',mat2:'feuer_geist',      result:'dragon',          evoChain:true },
  { mat1:'dragon',           mat2:'eisdrache',        result:'drachen_kaiser',  evoChain:true },
  { mat1:'dragon',           mat2:'dragon',           result:'twindragon',      evoChain:false },

  /* ─── CROSS-RACE FUSIONEN ─── */
  { mat1:'dragon',           mat2:'soldier',          result:'wardragon',       evoChain:false },
  { mat1:'dragon',           mat2:'knight',           result:'wardragon',       evoChain:false },
  { mat1:'dragon',           mat2:'orc',              result:'wardragon',       evoChain:false },
  { mat1:'priest',           mat2:'witch',            result:'grandsorc',       evoChain:false },
  { mat1:'giant',            mat2:'golem',            result:'ironcolossus',    evoChain:false },
  { mat1:'giant',            mat2:'belagerungsgolem', result:'ironcolossus',    evoChain:false },
  { mat1:'assassin',         mat2:'goblin',           result:'shadowstalker',   evoChain:false },
  { mat1:'assassin',         mat2:'schattenschleicher',result:'shadowstalker',  evoChain:false },
  { mat1:'soldier',          mat2:'knight',           result:'chaosknight',     evoChain:false },
  { mat1:'dunkelherr',       mat2:'schattenlord',     result:'dunkel_titan',    evoChain:false },
  { mat1:'ork_kriegsherr',   mat2:'dunkelherr',       result:'ork_gott',        evoChain:false },
  { mat1:'chaos_elementar',  mat2:'thundergod',       result:'twindragon',      evoChain:false },
];

/* ── Hilfsfunktionen ── */

function getCardById(id) {
  return ALL_CARDS.find(c => c.id === id)
      || FUSION_MONSTERS.find(c => c.id === id)
      || null;
}

function getFusionResult(id1, id2) {
  return FUSION_RECIPES.find(r =>
    (r.mat1 === id1 && r.mat2 === id2) ||
    (r.mat1 === id2 && r.mat2 === id1)
  ) || null;
}

function cloneCard(card) {
  return { ...card, uid: crypto.randomUUID() };
}

/** Tribute-System deaktiviert — Level-System entfernt. */
function getTributeCost(_level) {
  return 0;
}

function shuffleDeck(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Starter-Deck für einen neuen Run — Editor-Override hat Priorität */
function buildStarterDeck() {
  const defaultIds = [
    /* Kleine Kobolde zum Fusionieren */
    'kobold_jung','kobold_jung','kobold_speer',
    /* Frühe Ork-Krieger */
    'ork_rekrut','ork_rekrut',
    /* Untote als Basis */
    'skelett','zombie','zombie',
    /* Mensch Support */
    'wache','priest',
    /* Frühe Elementare */
    'feuer_geist',
    /* Spells: burn + heal + draw */
    'fireball','heallight','darkinsight',
    /* Falle */
    'sacredwall',
  ];
  const ids = (window.DD_CUSTOM && window.DD_CUSTOM.starterDeck && window.DD_CUSTOM.starterDeck.length > 0)
    ? window.DD_CUSTOM.starterDeck
    : defaultIds;
  return ids.map(id => cloneCard(getCardById(id))).filter(Boolean);
}

/** Seltenheits-gewichteter Karten-Pool für Drops/Rewards */
function drawRewardCards(count = 3) {
  const pool = ALL_CARDS.filter(c => c.id !== 'kobold_jung' && c.id !== 'dorfbewohner');
  const weights = { common:40, uncommon:25, rare:20, epic:10, legendary:5 };
  const weighted = [];
  pool.forEach(c => { for (let i = 0; i < (weights[c.rarity] || 10); i++) weighted.push(c); });
  const chosen = [];
  while (chosen.length < count) {
    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    if (!chosen.find(c => c.id === pick.id)) chosen.push(pick);
  }
  return chosen;
}

/** Karten für Shop (teurer je höher Seltenheit) — Editor-Override möglich */
function shopPrice(card) {
  const cfg = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const prices = {
    common:    Number(cfg['cfg-price-common'])    || 20,
    uncommon:  Number(cfg['cfg-price-uncommon'])  || 40,
    rare:      Number(cfg['cfg-price-rare'])      || 70,
    epic:      Number(cfg['cfg-price-epic'])      || 110,
    legendary: Number(cfg['cfg-price-legendary']) || 160,
  };
  return prices[card.rarity] || 50;
}

function buildShopOffer() {
  return drawRewardCards(4).map(c => ({ ...c, price: shopPrice(c) }));
}

/* ──────────────────────────────────────────────────
   DD_CUSTOM OVERRIDE — Karten
────────────────────────────────────────────────── */
(function _applyCardOverrides() {
  if (!window.DD_CUSTOM || !window.DD_CUSTOM.cards) return;
  window.DD_CUSTOM.cards.forEach(custom => {
    const idx = ALL_CARDS.findIndex(c => c.id === custom.id);
    if (idx >= 0) ALL_CARDS.splice(idx, 1, custom);
    else          ALL_CARDS.push(custom);
  });
})();

/* ──────────────────────────────────────────────────
   DD_CUSTOM OVERRIDE — Fusionsrezepte
────────────────────────────────────────────────── */
(function _applyRecipeOverrides() {
  if (!window.DD_CUSTOM || !window.DD_CUSTOM.recipes) return;
  FUSION_RECIPES.length = 0;
  window.DD_CUSTOM.recipes.forEach(r => FUSION_RECIPES.push(r));
})();

/* ──────────────────────────────────────────────────
   DD_CUSTOM OVERRIDE — Fusion-Monster
────────────────────────────────────────────────── */
(function _applyFusionMonsterOverrides() {
  if (!window.DD_CUSTOM || !window.DD_CUSTOM.fusionMonsters) return;
  window.DD_CUSTOM.fusionMonsters.forEach(custom => {
    const idx = FUSION_MONSTERS.findIndex(c => c.id === custom.id);
    if (idx >= 0) FUSION_MONSTERS.splice(idx, 1, custom);
    else          FUSION_MONSTERS.push(custom);
  });
})();

(function _prepareLocalizedCards() {
  if (typeof prepareCardLocalization !== 'function') return;
  [...ALL_CARDS, ...FUSION_MONSTERS].forEach(prepareCardLocalization);
})();
