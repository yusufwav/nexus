import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard-shell";
import {
  PlaceholderAction,
  PlaceholderField,
  PlaceholderSwitch,
} from "@/components/settings-controls";
import { requireSession } from "@/lib/session";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Settings · Nexus",
  description: "Your profile, security, notifications, and billing.",
};

/**
 * SETTINGS — /dashboard/settings
 * ------------------------------------------------------------
 * Auth required. Profile, account/security, notifications, billing.
 *
 * The identity shown here is real — it comes from the session, not
 * from copy on the page. Every control is a placeholder: nothing here
 * persists, including the name and email fields, which look editable
 * but only hold their value until you reload.
 *
 * TODO: profile name and email should be the first group that works,
 * since the columns already exist. See IDEAS/TODO.md.
 */
export default async function SettingsPage(): Promise<React.JSX.Element> {
  const user = await requireSession("/dashboard/settings");

  const joined = new Date(user.createdAt).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <DashboardShell user={user} active="/dashboard/settings">
      <div className="nt-pagehead">
        <div className="nt-pagehead__path">
          <b>~/nexus</b>
          <span>/dashboard/settings</span>
        </div>
        <h2 className="nt-pagehead__title">Settings</h2>
        <p className="nt-pagehead__lead">
          Nothing on this page saves yet. Every control below is a placeholder for a layout, not a
          working setting.
        </p>
      </div>

      {/* ---- Profile ---- */}
      <section className="nt-setgroup" data-reveal="rise">
        <div className="nt-setgroup__h">
          <h3>profile</h3>
          <span>how you appear in the app</span>
        </div>
        <div className="nt-setgroup__body">
          <PlaceholderField
            id="set-name"
            label="display name"
            hint="Shown on the dashboard and on anything you publish."
            defaultValue={user.name}
          />
          <PlaceholderField
            id="set-email"
            label="email"
            hint="Also your sign-in name. Changing it needs verification."
            defaultValue={user.email}
            type="email"
          />
          <PlaceholderAction
            label="Profile picture"
            description="Currently initials. A real upload would go to object storage and write to user.image."
            action="upload"
          />
          <PlaceholderAction
            label="Account created"
            description={`${joined} · email ${user.emailVerified ? "verified" : "not verified"}`}
            action="delete account"
            danger
          />
        </div>
      </section>

      {/* ---- Security ---- */}
      <section className="nt-setgroup" data-reveal="rise">
        <div className="nt-setgroup__h">
          <h3>account &amp; security</h3>
          <span>password, sessions, sign-in methods</span>
        </div>
        <div className="nt-setgroup__body">
          <PlaceholderAction
            label="Change password"
            description="Needs a current-password check and a confirmation field. Not implemented."
            action="change"
          />
          <PlaceholderAction
            label="Sign in with Google or GitHub"
            description="Social auth is not set up. The buttons on the login page are placeholders."
            action="connect"
          />
          <PlaceholderAction
            label="Two-factor authentication"
            description="An authenticator app or a passkey. Not implemented."
            action="set up"
          />
          <PlaceholderAction
            label="Active sessions"
            description="Sign out everywhere except this device. Not implemented."
            action="review"
          />
        </div>
      </section>

      {/* ---- Notifications ---- */}
      <section className="nt-setgroup" data-reveal="rise">
        <div className="nt-setgroup__h">
          <h3>notifications</h3>
          <span>what reaches you, and where</span>
        </div>
        <div className="nt-setgroup__body">
          <PlaceholderSwitch
            label="Module updates"
            description="When a module you own gains a new section or a correction."
            defaultOn
          />
          <PlaceholderSwitch
            label="Reply to feedback"
            description="When you send improvement feedback and I respond."
          />
          <PlaceholderSwitch
            label="Study reminders"
            description="A nudge on a day you have not opened anything."
          />
          <PlaceholderSwitch
            label="Product announcements"
            description="Occasional email when something meaningful ships."
          />
          <PlaceholderAction
            label="Notification email address"
            description="Defaults to your sign-in email. No preference store exists yet."
            action="choose"
          />
        </div>
      </section>

      {/* ---- Billing ---- */}
      <section className="nt-setgroup" data-reveal="rise">
        <div className="nt-setgroup__h">
          <h3>billing</h3>
          <span>payment methods, receipts, VAT</span>
        </div>
        <div className="nt-setgroup__body">
          <PlaceholderAction
            label="Payment methods"
            description="No payment provider is connected, so there is nothing to store yet."
            action="add card"
          />
          <PlaceholderAction
            label="Billing details"
            description="For a VAT receipt. Students may need this to claim a study expense."
            action="edit"
          />
          <PlaceholderAction
            label="Receipts"
            description="One per purchase, downloadable as PDF. There are no purchases yet."
            action="view"
          />
          <PlaceholderAction
            label="Refund a purchase"
            description="Would flip the purchase to refunded and revoke access."
            action="request"
            danger
          />
        </div>
      </section>

      {/* ---- Appearance & data ---- */}
      <section className="nt-setgroup" data-reveal="rise">
        <div className="nt-setgroup__h">
          <h3>appearance &amp; data</h3>
          <span>theme, motion, your data</span>
        </div>
        <div className="nt-setgroup__body">
          <PlaceholderSwitch
            label="Reduce motion"
            description="Stops the ASCII field and the reveal animations. The OS-level setting already does this."
            defaultOn
          />
          <PlaceholderSwitch
            label="Light theme"
            description="Dark only for now. The palette was designed for black and has no light counterpart."
          />
          <PlaceholderAction
            label="Export your data"
            description="Every purchase, note, and annotation as JSON."
            action="export"
          />
          <PlaceholderAction
            label="Sign out everywhere"
            description="Revoke all sessions on every device."
            action="sign out"
            danger
          />
        </div>
      </section>

      <p className="nt-note">Every control here is inert by design. The gaps are in IDEAS/TODO.md.</p>
    </DashboardShell>
  );
}