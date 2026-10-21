const nodemailer = require("nodemailer");

const PROJECT_NAME = "NoName RP";
const SERVER_IP = process.env.SERVER_IP || "127.0.0.1:22005";
const SERVER_ONLINE = process.env.SERVER_ONLINE || "2000";
const DISCORD_URL = process.env.DISCORD_URL || "https://discord.gg/twinkle";
const VK_URL = process.env.VK_URL || "https://vk.com/twinklerp";
const YOUTUBE_URL = process.env.YOUTUBE_URL || "https://youtube.com/@twinklerp";
const WEBSITE_URL = process.env.WEBSITE_URL || "https://twinkle-logs.com";

const MAIL_CONFIGURED = Boolean(
  String(process.env.MAIL_HOST || "").trim()
  && String(process.env.MAIL_USER || "").trim()
  && String(process.env.MAIL_PASS || "").trim()
);

const transporter = MAIL_CONFIGURED ? nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 465),
  secure: String(process.env.MAIL_SECURE) === "true",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
}) : null;

function requireMail() {
  if (!transporter) {
    const error = new Error("Почтовый сервер не настроен.");
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFooter() {
  return `
    <div style="padding:30px 32px;background:#0b0b10;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
      <div style="margin-bottom:18px;color:#ff2d7a;font-size:18px;font-weight:800;">
        ${PROJECT_NAME}
      </div>

      <div style="margin-bottom:22px;">
        <a href="${DISCORD_URL}" target="_blank" style="display:inline-block;margin:0 6px;text-decoration:none;">
          <span style="display:inline-block;width:42px;height:42px;line-height:42px;border-radius:50%;background:#181820;color:#fff;text-align:center;font-size:16px;font-weight:800;">
            DC
          </span>
        </a>

        <a href="${VK_URL}" target="_blank" style="display:inline-block;margin:0 6px;text-decoration:none;">
          <span style="display:inline-block;width:42px;height:42px;line-height:42px;border-radius:50%;background:#181820;color:#fff;text-align:center;font-size:16px;font-weight:800;">
            VK
          </span>
        </a>

        <a href="${YOUTUBE_URL}" target="_blank" style="display:inline-block;margin:0 6px;text-decoration:none;">
          <span style="display:inline-block;width:42px;height:42px;line-height:42px;border-radius:50%;background:#181820;color:#fff;text-align:center;font-size:18px;font-weight:800;">
            ▶
          </span>
        </a>
      </div>

      <div style="color:#8b8b96;font-size:13px;line-height:1.6;">
        Это письмо отправлено автоматически.<br>
        Пожалуйста, не отвечайте на него.
      </div>
    </div>
  `;
}

function buildLayout(content) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          a:hover { opacity: .88 !important; }
          .tw-button:hover { transform: translateY(-1px); filter: brightness(1.08); }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#050508;font-family:Arial,sans-serif;color:#ffffff;">
        <div style="padding:42px 18px;background:#050508;">
          <div style="max-width:640px;margin:0 auto;background:#111116;border-radius:26px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);box-shadow:0 22px 70px rgba(0,0,0,0.5);">
            ${content}
            ${getFooter()}
          </div>
        </div>
      </body>
    </html>
  `;
}

function getServerBlock() {
  return `
    <div style="margin-top:28px;background:#18181f;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:22px;">
      <div style="color:#fff;font-size:16px;font-weight:800;margin-bottom:16px;">
        Информация о сервере
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;background:#101016;border-radius:16px;padding:16px;">
          <div style="color:#8b8b96;font-size:13px;margin-bottom:7px;">IP сервера</div>
          <div style="color:#fff;font-size:17px;font-weight:800;">${escapeHtml(SERVER_IP)}</div>
        </div>

        <div style="flex:1;min-width:180px;background:#101016;border-radius:16px;padding:16px;">
          <div style="color:#8b8b96;font-size:13px;margin-bottom:7px;">Слотов</div>
          <div style="color:#fff;font-size:17px;font-weight:800;">${escapeHtml(SERVER_ONLINE)}</div>
        </div>
      </div>
    </div>
  `;
}

function getActionButtons() {
  return `
    <div style="margin-top:28px;text-align:center;">
      <a class="tw-button" href="${WEBSITE_URL}" target="_blank" style="display:inline-block;margin:6px;padding:15px 24px;border-radius:14px;background:linear-gradient(135deg,#ff2d7a,#ff6aa2);color:#fff;text-decoration:none;font-size:15px;font-weight:800;box-shadow:0 10px 28px rgba(255,45,122,.28);">
        Играть
      </a>

      <a class="tw-button" href="${DISCORD_URL}" target="_blank" style="display:inline-block;margin:6px;padding:15px 24px;border-radius:14px;background:linear-gradient(135deg,#5865f2,#8b5cf6);color:#fff;text-decoration:none;font-size:15px;font-weight:800;box-shadow:0 10px 28px rgba(88,101,242,.28);">
        Открыть Discord
      </a>
    </div>
  `;
}

async function sendRecoveryCode(email, code) {
  requireMail();
  const html = buildLayout(`
    <div style="padding:48px 38px;">
      <div style="width:76px;height:76px;margin:0 auto 28px;border-radius:50%;background:linear-gradient(135deg,#ff2d7a,#ff6aa2);text-align:center;line-height:76px;font-size:34px;box-shadow:0 12px 32px rgba(255,45,122,.38);">
        🔒
      </div>

      <h1 style="margin:0 0 18px;text-align:center;font-size:34px;font-weight:900;color:#fff;">
        Восстановление пароля
      </h1>

      <p style="margin:0 auto 34px;max-width:440px;text-align:center;font-size:16px;line-height:1.7;color:#a1a1aa;">
        Вы запросили восстановление доступа к аккаунту на сервере
        <span style="color:#fff;font-weight:800;">${PROJECT_NAME}</span>.
      </p>

      <div style="margin:0 auto 30px;max-width:380px;background:#18181f;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:28px;text-align:center;">
        <div style="color:#8b8b96;font-size:14px;margin-bottom:14px;">
          Ваш код подтверждения
        </div>

        <div style="font-size:46px;letter-spacing:10px;font-weight:900;color:#ff2d7a;">
          ${escapeHtml(code)}
        </div>
      </div>

      <div style="background:#18181f;border-radius:20px;padding:22px 24px;border:1px solid rgba(255,255,255,0.07);">
        <div style="color:#fff;font-size:15px;font-weight:800;margin-bottom:8px;">
          Код действует 10 минут
        </div>
        <div style="color:#8b8b96;font-size:14px;line-height:1.7;">
          Если вы не запрашивали восстановление аккаунта — просто проигнорируйте это письмо.
        </div>
      </div>

      ${getActionButtons()}
    </div>
  `);

  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME || PROJECT_NAME}" <${process.env.MAIL_USER}>`,
    to: email,
    subject: `Код восстановления аккаунта ${PROJECT_NAME}`,
    html
  });
}

async function sendPasswordChanged(email, info = {}) {
  if (!transporter) return false;
  const ip = escapeHtml(info.ip || "Скрыто");
  const device = escapeHtml(info.device || "Неизвестное устройство");
  const geo = escapeHtml(info.geo || "Не определено");
  const date = escapeHtml(info.date || new Date().toLocaleString("ru-RU"));

  const html = buildLayout(`
    <div style="padding:48px 38px;">
      <div style="width:76px;height:76px;margin:0 auto 28px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#4ade80);text-align:center;line-height:76px;font-size:38px;box-shadow:0 12px 32px rgba(34,197,94,.32);">
        ✓
      </div>

      <h1 style="margin:0 0 18px;text-align:center;font-size:34px;font-weight:900;color:#fff;">
        Пароль успешно изменён
      </h1>

      <p style="margin:0 auto 30px;max-width:450px;text-align:center;font-size:16px;line-height:1.7;color:#a1a1aa;">
        Пароль от вашего аккаунта <span style="color:#fff;font-weight:800;">${PROJECT_NAME}</span> был успешно изменён.
      </p>

      <div style="background:#18181f;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:24px;">
        <div style="color:#fff;font-size:16px;font-weight:800;margin-bottom:18px;">
          Security alert
        </div>

        <table style="width:100%;border-collapse:collapse;color:#a1a1aa;font-size:14px;">
          <tr>
            <td style="padding:10px 0;color:#8b8b96;">Дата и время</td>
            <td style="padding:10px 0;text-align:right;color:#ff2d7a;font-weight:700;">${date}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8b8b96;">IP-адрес</td>
            <td style="padding:10px 0;text-align:right;color:#fff;font-weight:700;">${ip}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8b8b96;">Устройство</td>
            <td style="padding:10px 0;text-align:right;color:#fff;font-weight:700;">${device}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8b8b96;">Геолокация</td>
            <td style="padding:10px 0;text-align:right;color:#fff;font-weight:700;">${geo}</td>
          </tr>
        </table>
      </div>

      <div style="margin-top:24px;background:#1b1016;border:1px solid rgba(255,45,122,.22);border-radius:18px;padding:20px;color:#f0a6c2;font-size:14px;line-height:1.7;">
        Если это были не вы — срочно восстановите пароль и обратитесь в техническую поддержку.
      </div>

      ${getActionButtons()}
    </div>
  `);

  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME || PROJECT_NAME}" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Пароль успешно изменён",
    html
  });
}

async function sendRegisterSuccess(email, login, info = {}) {
  if (!transporter) return false;
  const date = escapeHtml(info.date || new Date().toLocaleString("ru-RU"));

  const html = buildLayout(`
    <div style="padding:48px 38px;">
      <div style="width:76px;height:76px;margin:0 auto 28px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#ff2d7a);text-align:center;line-height:76px;font-size:36px;box-shadow:0 12px 32px rgba(124,58,237,.35);">
        ✨
      </div>

      <h1 style="margin:0 0 18px;text-align:center;font-size:34px;font-weight:900;color:#fff;">
        Добро пожаловать!
      </h1>

      <p style="margin:0 auto 34px;max-width:460px;text-align:center;font-size:16px;line-height:1.7;color:#a1a1aa;">
        Спасибо за регистрацию на <span style="color:#fff;font-weight:800;">${PROJECT_NAME}</span>.
        Вы сделали первый шаг в новый мир возможностей.
      </p>

      <div style="background:#18181f;border-radius:20px;padding:26px;border:1px solid rgba(255,255,255,0.07);">
        <div style="color:#fff;font-size:16px;font-weight:800;margin-bottom:18px;">
          Данные аккаунта
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:10px 0;color:#8b8b96;">Логин</td>
            <td style="padding:10px 0;text-align:right;color:#ff2d7a;font-weight:800;">${escapeHtml(login)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8b8b96;">Дата регистрации</td>
            <td style="padding:10px 0;text-align:right;color:#fff;font-weight:700;">${date}</td>
          </tr>
        </table>
      </div>

      ${getServerBlock()}
      ${getActionButtons()}
    </div>
  `);

  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME || PROJECT_NAME}" <${process.env.MAIL_USER}>`,
    to: email,
    subject: `Добро пожаловать на ${PROJECT_NAME}`,
    html
  });
}

module.exports = {
  sendRecoveryCode,
  sendPasswordChanged,
  sendRegisterSuccess
};