const {promisify} = require('bluebird');
const request = promisify(require('request'));
const jwtVerify = promisify(require('jsonwebtoken').verify);

async function getPublicKey() {
    const keysOptions = {
        method: 'GET',
        url: `https://<region>.certificate-manager.cloud.ibm.com/api/v1/instances/<Encoded Instance CRN>/notifications/publicKey?keyFormat=pem`,
        headers: {
            'cache-control': 'no-cache'
        }
    };
    const keysResponse = await request(keysOptions);
    return JSON.parse(keysResponse.body).publicKey;
}

function getDate(timestamp) {
    return new Date(timestamp).toDateString();
}

function createIssueBody(notificationData) {
    if (notificationData.event_type === "cert_about_to_expire_reimport_required" ||
        notificationData.event_type === "cert_about_to_expire_renew_required")
        return `${notificationData.certificates.length} certificate/s will expire on ${getDate(notificationData.expiry_date)}. CertificateManager link: ${notificationData.certificate_manager_url}`;
    if (notificationData.event_type === "cert_expired_reimport_required" ||
        notificationData.event_type === "cert_expired_renew_required")
        return `${notificationData.certificates.length} certificate/s have already expired. CertificateManager link: ${notificationData.certificate_manager_url}`;
}

async function main(params) {
    try {
        const publicKey = await getPublicKey();
        const decodedNotification = await jwtVerify(params.data, publicKey);
        console.log(`Notification: ${JSON.stringify(decodedNotification)}`);
        const body = createIssueBody(decodedNotification);
        if (!body) {
            console.log(`No action needed for this notification. Event type: ${decodedNotification.event_type}`);
            return;
        }

        const pdparams = {
            "service_key": "<your service key from PD>",
            "description": body,
            "event_type": "trigger"
        };

        if (!pdparams.service_key || !pdparams.description) {
            throw 'pd params must include service_key and description';
        }
        if (!pdparams.event_type) {
            pdparams.event_type = 'trigger';
        }

        // Set request options
        const options = {
            url: 'https://events.pagerduty.com/generic/2010-04-15/create_event.json',
            method: 'POST',
            json: true,
            body: pdparams
        };

        // Make POST request
        await request(options);
    } catch (err) {
        console.log(err);
    }
}
