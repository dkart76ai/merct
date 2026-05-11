const QUEUE_NAMES = {
  FIND_OBJECTS: 'find-objects',
  NOTIFICATION_DISCORD: 'notification-discord',
  NOTIFICATION_GAME: 'notification-in-game',
  SCAN_KINGDOM: 'scan-kingdom',
  SCAN_REFRESH_PLAYER_INFO: 'refresh-player-info'
}

const JOB_TYPES = QUEUE_NAMES

const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
  IDLE: 5
}

const DEFAULT_KINGDOM = 'CONFIG:DEFAULT_KINGDOM'
const ACTIVE_CHAT_CHANNEL = 'CONFIG:ACTIVE_CHAT_CHANNEL'
const SCAN_OTHER_KINGDOMS_KEY = 'TIMERS:SCAN_OTHER_KINGDOMS_KEY'

const resources = {
  //! esto parece wealth counter,
  //! va incrementando cuando haces click en un chest

  //   'cofre cuidaddela elfica lvl 15': 00,
  //   'cofre de gladiador arena': 45380,
  // "cofre de arena crypt lvl20"
  // "cofre de cobalto crytp lvl 15":45382,
  // "cofre raro de dragon crypt lvl 15":45390
  // "cofre raro de dragon crypt lvl 20":45383,
  // "cofre de arena crypt lvl 5":45391
  // "cofre de arena crypt lvl 15":45384,
  // "cofre de fuego crypt lvl 15":45392,
  // "cofre raro de dragon crypt lvl 15":45387
  // "cofre olvidado crypt lvl 10"
  // "cofre olvidado crypt lvl 20":45388
  // "cofre de los malditos crypt epic lvl 15"45389
  // "cofre de la casa del terror crypt lvl 20"45393
  // "cofre barbaro crypt lvl 10"
  // "cofre del taller gnomico crypt lvl 10"
  // "cofre de cobra crypt lvl 5"
  //! "resourcecode": amount
  1: 'oro', //*
  35: 'sacred potion', //*
  125: 'daily job',
  2406: '1k dragon coin',

  1536: '1500 plata', //*-
  1120: '7500 plata', //*-
  1504: '8k plata', //*-
  1121: '25k plata', //*-
  1122: '75k plata', //*--
  1593: '125k plata',
  1123: '250k plata',

  1572: '5k madera',
  1306: '10k madera', //**
  1311: '25k madera',
  1306: '10k madera',
  1512: '30k madera', //*-
  1575: '100k madera', //*
  1567: '250k madera', //*
  1103: '500k madera',

  1536: '1500 hierro',
  1546: '3k hierro', //*-
  1578: '5k hierro',
  1307: '10k hierro', //*-
  1312: '25k hierro',
  1519: '30k hierro', //*
  1113: '500k hierro?', //*

  1303: '3k piedra', //*
  1308: '10k piedra', //*
  1526: '15k piedra',
  1313: '25k piedra', //*
  1526: '30k piedra',
  1107: '150k piedra',
  1568: '250k piedra',
  1108: '500k piedra',
  1333: '750k piedra',

  1556: '5k food', //*
  1531: '10k food',
  1115: '25k food', //*
  1596: '50k food',
  1631: '50k food', //*-
  1116: '75k food',

  2003: '15min speed up', //**--
  2005: '1hr speed up', //**---
  2006: '3hr speed up', //*---
  2007: '8hr speed up', //*
  2008: '15hr speed up', //*--

  2102: '50% march', //*--

  2050: '1hr clan speedup', //*
  2052: '8hr clan speedup', //*-
  2053: '15hr clan speedup',
  2055: '3d clan speedup',

  2051: '3hr clan speedup', //*
  524: 'cog wheel engranaje antiguo',
  517: 'hilo runico',
  513: 'pluma de arpia',
  518: 'weada azul potion lagrimas de sirena',
  520: 'polvo arcano',
  540: 'garrapata, corazon de dragon petrificado',
  44752: 1,
  44753: 1,
  44754: 1,
  44755: 1,
  44756: 1,
  44757: 2,
  44758: 3,
  44759: 2,
  44760: 1,
  44761: 2,
  44762: 2,
  44763: 3,
  44764: 3,
  44765: 3,
  44766: 4,
  44767: 4,
  44768: 3,
  44769: 6,
  44770: 2,
  44771: 2,
  44772: 3
}
module.exports = {
  QUEUE_NAMES,
  JOB_TYPES,
  PRIORITY,
  DEFAULT_KINGDOM,
  ACTIVE_CHAT_CHANNEL,
  SCAN_OTHER_KINGDOMS_KEY
}
