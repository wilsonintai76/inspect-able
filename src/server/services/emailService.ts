/**
 * emailService.ts
 *
 * Sends transactional emails via the Resend API.
 *
 * Setup:
 *   1. Create a free account at https://resend.com
 *   2. Verify the domain "inspect-able.com" in Resend → Domains
 *   3. Run: wrangler secret put RESEND_API_KEY
 *      Paste your Resend API key when prompted.
 */

const RESEND_API = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Inspect-Able <noreply@inspect-able.com>';

/**
 * Sends a supervisor approval email when an audit schedule transitions to
 * "In Progress" (all 4 fields filled: date, supervisor, auditor1, auditor2).
 *
 * The supervisor is asked to log in and click the Lock button to confirm.
 */
export async function sendSupervisorApprovalEmail(
  apiKey: string,
  to: string,
  supervisorName: string,
  locationName: string,
  departmentName: string,
  auditDate: string,
  appUrl: string,
): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:40px 40px 32px;text-align:center;">
            <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">Inspect-Able · Inspection Management</p>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:900;line-height:1.2;">Action Required</h1>
            <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">An inspection has been assigned to you</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Hello <strong style="color:#0f172a;">${supervisorName}</strong>,</p>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
              An inspection has been fully scheduled and is now In Progress.
              Please review the details below and <strong style="color:#4f46e5;">lock the schedule</strong> to approve it.
            </p>

            <!-- Details card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;margin:0 0 28px;">
              <tr>
                <td style="padding:24px 28px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom:16px;">
                        <p style="margin:0 0 4px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Location</p>
                        <p style="margin:0;color:#0f172a;font-size:17px;font-weight:900;">${locationName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-bottom:16px;">
                        <p style="margin:0 0 4px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Department</p>
                        <p style="margin:0;color:#334155;font-size:15px;font-weight:600;">${departmentName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <p style="margin:0 0 4px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Scheduled Date</p>
                        <p style="margin:0;color:#334155;font-size:15px;font-weight:600;">${auditDate}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Steps -->
            <p style="margin:0 0 12px;color:#475569;font-size:14px;font-weight:700;">To approve this inspection:</p>
            <ol style="margin:0 0 28px;padding-left:20px;color:#475569;font-size:14px;line-height:1.9;">
              <li>Log in to <a href="${appUrl}" style="color:#4f46e5;font-weight:700;text-decoration:none;">Inspect-Able</a></li>
              <li>Navigate to the <strong style="color:#0f172a;">Inspection Schedule</strong> view</li>
              <li>Find the location above and click the <strong style="color:#0f172a;">🔒 Lock</strong> button to confirm</li>
            </ol>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:14px;background:#4f46e5;">
                  <a href="${appUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:14px;">Open Inspect-Able &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              This is an automated notification from Inspect-Able.<br>
              Please do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Action Required: Inspection Assigned — ${locationName} (${auditDate})`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

/**
 * Sends a pre-date reminder email 2 days before the scheduled audit date.
 * This is an automated nudge for the supervisor to lock the schedule.
 */
export async function sendPreDateReminderEmail(
  apiKey: string,
  to: string,
  supervisorName: string,
  locationName: string,
  departmentName: string,
  auditDate: string,
  appUrl: string,
): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.10);max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);padding:40px 40px 32px;text-align:center;">
            <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">Inspect-Able · Reminder</p>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:900;line-height:1.2;">Upcoming Inspection</h1>
            <p style="margin:10px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">An inspection is scheduled in 2 days and requires your attention</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">Hello <strong style="color:#0f172a;">${supervisorName}</strong>,</p>
            <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
              This is a reminder that the following inspection is scheduled for <strong style="color:#ea580c;">${auditDate}</strong> and is scheduled and requires your attention.
              Please lock the schedule to confirm it before the date arrives.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;margin:0 0 28px;">
              <tr><td style="padding:24px 28px;">
                <p style="margin:0 0 4px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Location</p>
                <p style="margin:0 0 16px;color:#0f172a;font-size:17px;font-weight:900;">${locationName}</p>
                <p style="margin:0 0 4px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Department</p>
                <p style="margin:0 0 16px;color:#334155;font-size:15px;font-weight:600;">${departmentName}</p>
                <p style="margin:0 0 4px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Scheduled Date</p>
                <p style="margin:0;color:#ea580c;font-size:15px;font-weight:600;">${auditDate}</p>
              </td></tr>
            </table>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:14px;background:#ea580c;">
                  <a href="${appUrl}" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:14px;">Open Inspect-Able &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">This is an automated notification from Inspect-Able.<br>Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject: `Reminder: Inspection in 2 Days — ${locationName} (${auditDate})`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}
