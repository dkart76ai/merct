

"wss://ws-1ca99c8c-xxx.sendbird.com/?p=JS&pv=Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0&sv=4.19.6&ai=1111111-22B2-4DE6-9507-051111AAA555&user_id=tb:111222333&pmce=1&active=1&device_token_types=gcm,huawei,apns&SB-User-Agent=JS/c4.19.6///oweb&SB-SDK-User-Agent=main_sdk_info=chat/js/4.19.6&device_os_platform=web&os_version=Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0&Request-Sent-Timestamp=1773613117114&include_extra_data=premium_feature_list,file_upload_size_limit,application_attributes,emoji_hash,multiple_file_send_max_size,notifications,message_template,ai_agent&use_local_cache=0&include_poll_details=1&config_ts=0"



import SendbirdChat from '@sendbird/chat';
import { GroupChannelModule } from '@sendbird/chat/groupChannel';

const sb = SendbirdChat.init({
    appId: '1111111-22B2-4DE6-9507-051111AAA555', //'TU_APP_ID',
    modules: [new GroupChannelModule()],
});

// Conectar al servidor
await sb.connect('tb:123123'); //user_id


async function enviarMensajeConCoordenadas(channelUrl, coords) {
    // 1. Obtener el canal
    const channel = await sb.groupChannel.getChannel(channelUrl);

    // 2. Configurar los parámetros (el JSON va en "data")
    const params = {
        message: "/%0%/", // El texto que ve el usuario
        data: JSON.stringify(coords), // Aquí guardas el JSON de las coordenadas
        customType: 'user'
    };

    // 3. Enviar
    channel.sendUserMessage(params)
        .onSucceeded((message) => {
            console.log('Mensaje enviado:', message.messageId);
        })
        .onFailed((error) => {
            console.error('Error:', error);
        });
}

// Ejemplo de uso con tu estructura:
const misCoordenadas = {
    subs: {
        "/%0%/": { type: "coord", x: 610, y: 936, realmId: 1003 }
    }
};

enviarMensajeConCoordenadas('URL_DEL_CANAL', misCoordenadas);

//----------------------

Basada en el
JSON que compartiste al principio de nuestra conversación (que es el mensaje enviado a través de ese WebSocket), la URL es:
URL_DEL_CANAL: sendbird_group_channel_1111_11112bf1294ca261e9e9
¿Cómo identificarlo en el JSON?
Aparece bajo la clave "channel_url". En el SDK de JavaScript, lo usarías así para obtener el objeto del canal:

const channel = await sb.groupChannel.getChannel("sendbird_group_channel_1111_11112bf1294ca261e9e9");

//------------------

Basado en la URL del WebSocket que proporcionaste, los datos son los siguientes:

    TU_APP_ID: 11111C-222-4444-9999-22222222 (corresponde al parámetro ai).
    USER_ID: tb:123123 (corresponde al parámetro user_id).

Nota técnica:
En la URL también aparece un subdominio en el host (ws-1ca99c8c...), que es una versión en minúsculas del App ID. Al inicializar el SDK, debes usar el que tiene letras mayúsculas que extraje arriba.





2. Buscar en el objeto window (Escaneo automático)
Si no conoces el nombre, este script busca en todas las variables globales cualquier objeto que tenga propiedades típicas de Sendbird:

for (let key in window) {
    try {
        if (window[key] && (window[key].appId || window[key].currentUser || window[key].connect)) {
            console.log("Posible instancia encontrada en: window." + key);
            console.log(window[key]);
        }
    } catch (e) {}
}

//------------

 Posible instancia encontrada en: window.helpshiftWidgetConfig sentry.min-7.43.0.js:2:6079
19:25:16.756
Object { platformId: "scorewarrior_platform_20210219093831014-ba3a4acab40230a", domain: "scorewarrior", language: "es", fullPrivacy: false, appId: "3", widgetType: "helpcenter_and_webchat", widgetOptions: {…}, userId: "tb:111222333", userEmail: undefined, cifs: {…} }

//-------------
3. Interceptar el WebSocket (El método infalible)
Si no encuentras la variable, puedes "secuestrar" el constructor de WebSockets antes de que el juego conecte (esto requiere recargar la página):

    Pega esto en la consola:

const OriginalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
    if (url.includes("sendbird.com")) {
        console.log("¡Conexión Sendbird interceptada!");
        console.log("URL:", url);
    }
    return new OriginalWebSocket(url, protocols);
};

//---------
 URL: wss://ws-1CA99C8C-22B2-4DE6-9507-052C59BBB504.sendbird.com/?p=JS&pv=Mozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64%3B%20rv%3A149.0)%20Gecko%2F20100101%20Firefox%2F149.0&sv=4.19.6&ai=1CA99C8C-22B2-4DE6-9507-052C59BBB504&pmce=1&active=1&device_token_types=gcm%2Chuawei%2Capns&SB-User-Agent=JS/c4.19.6///oweb&SB-SDK-User-Agent=main_sdk_info%3Dchat%2Fjs%2F4.19.6%26device_os_platform%3Dweb%26os_version%3DMozilla%2F5.0%20(Windows%20NT%2010.0%3B%20Win64%3B%20x64%3B%20rv%3A149.0)%20Gecko%2F20100101%20Firefox%2F149.0&Request-Sent-Timestamp=1773620831758&include_extra_data=premium_feature_list%2Cfile_upload_size_limit%2Capplication_attributes%2Cemoji_hash%2Cmultiple_file_send_max_size%2Cnotifications%2Cmessage_template%2Cai_agent&use_local_cache=0&include_poll_details=1&config_ts=0


Con la URL que acabas de obtener, ya tienes los datos maestros para actuar de forma independiente:

    APP_ID: 1CA99C8C-22B2-4DE6-9507-052C59BBB504 (sacado de ai=).
    Versión del SDK: 4.19.6 (sacado de sv=).

El "Truco" para inyectar mensajes sin buscar la instancia del juego
Si no encuentras la variable del juego, puedes crear tu propia conexión paralela directamente en la consola. Esto enviará mensajes a nombre de tu usuario como si vinieran del juego:

    Carga el SDK en la consola (pega esto primero):

javascript

var script = document.createElement('script');
script.src = "https://unpkg.com";
document.head.appendChild(script);

Conecta y envía (espera 2 segundos a que cargue el script y pega esto):

 // Asegúrate de usar el USER_ID que viste en tus otras capturas
const USER_ID = "tb:22592514";
const APP_ID = "1CA99C8C-22B2-4DE6-9507-052C59BBB504";
const CHANNEL_URL = "sendbird_group_channel_535512298_82d0fedb957ac09089e026f42bf1294ca261e9e9";

const sb = SendbirdChat.init({
    appId: APP_ID,
    modules: [new SendbirdChat.GroupChannelModule()],
});

await sb.connect(USER_ID);
const channel = await sb.groupChannel.getChannel(CHANNEL_URL);

// El JSON de coordenadas que querías enviar
// const coordData = {
//     subs: { "/%0%/": { type: "coord", x: 610, y: 936, realmId: 1003 } }
// };
// Estructura exacta del campo "data" según tu ejemplo
const coordData = {
    subs: {
        "/%0%/": {
            type: "coord",
            entryType: "tile",
            x: 610,
            y: 936,
            realmId: 1003,
            staticId: 6,
            name: "",
            v: 1
        }
    }
};

// Envío con los parámetros exactos
channel.sendUserMessage({
    message: "[MOR] tariq: /%0%/", // El texto con el prefijo que aparece en tu JSON
    data: JSON.stringify(coordData), // El objeto convertido a string
    customType: "user"             // El tipo de mensaje que usa el juego
}).then(msg => {
    console.log("¡Mensaje idéntico enviado!");
});


// channel.sendUserMessage({
//     message: "/%0%/",
//     data: JSON.stringify(coordData),
//     customType: "user"
// }).then(msg => console.log("¡Coordenada inyectada!", msg.messageId));




//--------- prueba connexion envio mensaje
(async () => {
    // 1. Cargar el SDK dinámicamente si no está presente
    if (typeof SendbirdChat === 'undefined') {
        console.log("Cargando SDK de Sendbird...");
        const script = document.createElement('script');
        script.src = "https://unpkg.com";
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
    }

    // 2. Configuración de datos (ajustados a tu captura)
    const APP_ID = "1CA99C8C-22B2-4DE6-9507-052C59BBB504";
    const USER_ID = "tb:18453305";
    const CHANNEL_URL = "sendbird_group_channel_535512298_82d0fedb957ac09089e026f42bf1294ca261e9e9";

    const sb = SendbirdChat.init({
        appId: APP_ID,
        modules: [new SendbirdChat.GroupChannelModule()],
    });

    try {
        // 3. Conexión (Si falla aquí, es que necesitas un Session Token)
        console.log("Conectando a Sendbird...");
        await sb.connect(USER_ID);
        console.log("Conexión exitosa como:", sb.currentUser.nickname || USER_ID);

        // 4. Obtener el canal
        const channel = await sb.groupChannel.getChannel(CHANNEL_URL);

        // 5. Estructura exacta de la coordenada
        const coordData = {
            subs: {
                "/%0%/": {
                    type: "coord",
                    entryType: "tile",
                    x: 610,
                    y: 936,
                    realmId: 1003,
                    staticId: 6,
                    name: "",
                    v: 1
                }
            }
        };

        // 6. Enviar mensaje idéntico al original
        const params = {
            message: "torta: /%0%/",
            data: JSON.stringify(coordData),
            customType: "user"
        };

        const pendingMsg = channel.sendUserMessage(params);
        const message = await pendingMsg;

        console.log("%c✅ ¡Mensaje enviado con éxito!", "color: green; font-weight: bold;");
        console.log("ID del mensaje:", message.messageId);

    } catch (error) {
        console.error("%c❌ Error en la prueba:", "color: red; font-weight: bold;");
        console.error(error.message);
        if (error.code === 400302) {
            console.warn("Nota: El servidor requiere un 'Session Token' para conectar.");
        }
    }
})();
