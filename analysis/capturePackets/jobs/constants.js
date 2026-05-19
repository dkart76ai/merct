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
  //! "resourcecode": amount
  1: 'oro', //*
  2: 'silver',
  3: 'wood',
  4: 'iron',
  5: 'stone',
  6: 'food',
  7: '',
  8: 'valor points',
  9: 'conquest points',
  10: '',
  11: '',
  12: '',
  13: 'green tar',
  14: 'blue prints',
  15: '',
  16: 'gold ingots',
  17: '',
  18: 'restablecer puntos talento',
  20: 'cientific tractate',
  21: 'clan wood',
  22: '',

  30: 'dragon coins',
  31: 'clan dragon coin',
  32: 'epic purple tar',
  33: '',
  34: 'blue tar',
  35: 'sacred potion', //*

  55: 'rabia potion',

  125: 'daily job',
  201: 'rubi',
  204: 'jade',
  206: 'esmeralda',
  301: 'pidra ambar',
  302: 'amatista',
  306: 'cefirita',
  3408: 'opalo',

  3910: 'turmalina gris',
  3911: 'turmalina blanco',
  3912: 'turmalina verde',
  3913: 'turmalina azul',
  3920: 'titanita gris',
  3921: 'titanita blanco',
  3922: 'titanita verde',
  3923: 'titanita azul',

  3930: 'andalucita gris',
  3931: 'andalucita blanco',
  3932: 'andalucita verde',
  3933: 'andalucita azul',
  3940: 'azurita gris',
  3941: 'azurita blanco',
  3942: 'azurita verde',
  3943: 'azurita azul',

  500: 'gran sustancia del caos',
  501: 'runa demoniaca',
  502: 'fuego vivo',
  503: 'cuero encantado',
  504: 'seda imperial',
  505: 'colmillo de cerbero',
  506: 'tejido de hielo',
  507: 'carbon de magma',
  508: 'oleo de escarcha',
  509: 'fragmento de adamantio gris',

  511: 'fragmento de hierro fantasma',
  512: 'piel de hidra ceniza gris',
  513: 'pluma de arpia',

  515: 'cenizas de vampiro',
  516: 'pintura espectral',
  517: 'hilo runico',
  518: 'lagrimas de sirena gris',
  519: 'mineral de torio 1gris',
  520: 'polvo arcano',
  521: 'escamas de dragon verde',
  522: 'pellejo de grifo real gris',
  523: 'nucleo de golem',
  524: 'engranaje gnomico antiguo',

  530: 'gran sustancia del caos blanco',
  531: 'runa demoniaca blanco',
  532: 'mineral de torio gris',
  533: 'cuero encantado',

  539: 'fragmento de adamantio blanco',
  540: 'corazon de dragon petrificado blanco',

  542: 'piel de hidra ceniza blanco',
  543: 'pluma de fenix',

  545: 'ceniza de vampiro blanco',

  547: 'hilo runico blanco',
  548: 'lagrima de sirena',
  549: 'mineral de torio 2blanco',

  552: 'pellejo de grifo real blanco',

  569: 'fragmento de adamantio verde',

  577: 'hilo runico verde',

  580: 'polvo arcano verde',

  582: 'pellejo de grifo real verde',
  583: 'nucleo de golem verde',

  1045: '100 aceite, green tar',
  1046: '250 aceite verde',

  1101: '50k wood',
  1103: '500k madera',
  1104: '1.5m wood',

  1106: '50k piedra',
  1107: '150k piedra',
  1108: '500k piedra',
  1109: '1.5M piedra',

  1111: '50k hierro',
  1112: '150k hierro',
  1113: '500k hierro',
  1114: '1.5m hierro',
  1115: '25k food',
  1116: '75k food',
  1117: '250k food',
  1118: '750k food',

  1120: '7500 plata', //*-
  1121: '25k silver',
  1122: '75k silver',
  1123: '250k silver',
  1124: '750k silver',

  1146: 'wood production',

  1303: '3k piedra', //*

  1306: '10k wood',
  1307: '10k hierro',
  1308: '10k piedra',

  1311: '25k wood',
  1312: '25k hierro',
  1313: '25k piedra',

  1327: '1.5m silver',
  1328: '3m silver',

  1330: '5m food',
  1331: '750k wood',
  1332: '750k hierro',
  1333: '750k piedra',

  1335: '3m hierro',

  1337: '5m wood',
  1338: '5m hierro',
  1339: '5m piedra',

  1504: '8k silver',

  1512: '30k wood',

  1519: '30k hierro',

  1526: '30k piedra',

  1531: '10k food',

  1534: '150k food',

  1546: '3k hierro', //*-

  1556: '5k food', //*

  1559: '100k food',

  1567: '250k wood',
  1568: '250k piedra',
  1569: '250k hierro',

  1571: '1.5m food',
  1572: '5k wood',

  1575: '100k wood',
  1576: '125k wood',

  1578: '5k piedra',

  1581: '100k piedra',
  1582: '125k piedra',

  1584: '5k hierro',

  1587: '100k hierro',
  1588: '125k hierro',

  1592: '50k silver',
  1593: '125k silver',

  1596: '50k food',

  1631: '50k food',

  1633: '40k hierro',
  1634: '40k wood',

  2003: '15min speedup',
  2005: '1h speedup',
  2006: '3h speedup',
  2007: '8h speedup',
  2008: '15h speedup',
  2009: '1d speedup',
  2010: '3d speedup',
  2011: '7d speedup',
  2050: '1h clan speedup',
  2051: '3h clan speedup',
  2052: '8h clan speedup',
  2053: '15h clan speedup',
  2054: '1d clan speedup',
  2055: '3d clan speedup',
  2056: '7d clan speedup',
  2102: '50% march speedup',
  2106: '50% clan march',
  2107: '50% clan march',
  2406: '1k dragon coin',

  7802: 'bono de puntos de conquista',

  10001: 'acero azul',
  10905: 'cadena de mitril',
  100023: 'velocidad d marcha 50% x 1hr',

  702006: 'clan iron',
  703022: 'clan suppresion seal',
  74284: 'religious Tractate',
  701216: 'ollympus Torch',
  701220: 'chronogliph Fragment'
}
module.exports = {
  QUEUE_NAMES,
  JOB_TYPES,
  PRIORITY,
  DEFAULT_KINGDOM,
  ACTIVE_CHAT_CHANNEL,
  SCAN_OTHER_KINGDOMS_KEY
}
