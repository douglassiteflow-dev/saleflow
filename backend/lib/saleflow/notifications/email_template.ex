defmodule Saleflow.Notifications.EmailTemplate do
  @moduledoc "Standard Siteflow email layout and components."

  @doc "Wraps content in standard Siteflow email layout"
  def wrap(body_html) do
    """
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      #{body_html}
      <p style="color: #64748b; font-size: 14px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        Med vänliga hälsningar,<br>Siteflow
      </p>
    </div>
    """
  end

  @doc "Generates a styled CTA button"
  def button(text, url) do
    """
    <p style="margin: 24px 0;">
      <a href="#{url}" style="background: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
        #{text}
      </a>
    </p>
    """
  end
end
