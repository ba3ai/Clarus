# utils/emailing.py
from __future__ import annotations

from flask import current_app
import logging


def _resolve_sender() -> str | None:
    """Pick a sender in priority order."""
    cfg = current_app.config
    return (
        cfg.get("MAIL_DEFAULT_SENDER")
        or cfg.get("SMTP_FROM")
        or cfg.get("MAIL_USERNAME")
    )


def send_invite_email(email: str, name: str | None, link: str) -> bool:
    """
    Send an invite email. Returns True on success, False on failure.
    Logs a dev-friendly link if mail isn't configured.
    """
    mail_ext = current_app.extensions.get("mail")  # Flask-Mail instance
    if not mail_ext:
        current_app.logger.warning("[Mail disabled] Invite link for %s: %s", email, link)
        return False

    sender = _resolve_sender()
    if not sender:
        current_app.logger.error(
            "No sender configured. Set MAIL_DEFAULT_SENDER or MAIL_USERNAME."
        )
        return False

    try:
        from flask_mail import Message

        subject = current_app.config.get(
            "INVITE_SUBJECT", "You're invited to Venture360"
        )
        safe_name = (name or "").strip()

        text_body = (
            f"Hi {safe_name},\n\n"
            f"You’ve been invited. Finish setup here:\n{link}\n\n"
            f"This link expires in 7 days."
        )
        html_body = (
            f"<p>Hi {safe_name},</p>"
            f"<p>You’ve been invited. Finish setup here: "
            f'<a href="{link}" target="_blank" rel="noopener noreferrer">{link}</a></p>'
            f"<p>This link expires in 7 days.</p>"
        )

        msg = Message(
            subject=subject,
            recipients=[email],
            sender=sender,  # ✅ critical to avoid AssertionError
            body=text_body,
            html=html_body,
            reply_to=current_app.config.get("MAIL_REPLY_TO", sender),
        )

        mail_ext.send(msg)
        current_app.logger.info(
            "Invite email sent to %s via %s", email, current_app.config.get("MAIL_SERVER")
        )
        return True

    except Exception:
        current_app.logger.exception("Failed to send invitation email to %s", email)
        return False
