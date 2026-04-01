defmodule Saleflow.Notifications.Templates do
  @moduledoc """
  Renders transactional email templates for SaleFlow.

  Each public function returns `{subject, html_body}` where `html_body` is a
  fully rendered HTML string suitable for passing directly to
  `Saleflow.Notifications.Mailer.send_email/3`.

  Templates are EEx files stored under `priv/templates/email/`. Each inner
  template is wrapped in the shared `layout.html.eex` that applies SaleFlow
  branding (indigo header, white card on slate-50 background).

  ## Example

      {subject, html} = Saleflow.Notifications.Templates.render_otp_code("123456")
      Saleflow.Notifications.Mailer.send_email_async(user.email, subject, html)
  """

  @templates_dir Path.join(:code.priv_dir(:saleflow), "templates/email")

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @doc """
  Renders the OTP login-code email.

  Returns `{"Din inloggningskod - SaleFlow", html}`.
  """
  @spec render_otp_code(String.t()) :: {String.t(), String.t()}
  def render_otp_code(code) do
    html = render("otp_code.html.eex", code: code)
    {"Din inloggningskod - SaleFlow", html}
  end

  @doc """
  Renders the welcome / account-created email.

  Returns `{"Välkommen till SaleFlow!", html}`.
  """
  @spec render_welcome(String.t(), String.t()) :: {String.t(), String.t()}
  def render_welcome(name, login_url) do
    html = render("welcome.html.eex", name: name, login_url: login_url)
    {"Välkommen till SaleFlow!", html}
  end

  @doc """
  Renders the forced-logout notification email.

  Returns `{"Din session har avslutats - SaleFlow", html}`.
  """
  @spec render_force_logout(String.t()) :: {String.t(), String.t()}
  def render_force_logout(name) do
    html = render("force_logout.html.eex", name: name)
    {"Din session har avslutats - SaleFlow", html}
  end

  @doc """
  Renders a meeting-reminder email.

  Returns `{"Påminnelse: möte med <company>", html}`.
  """
  @spec render_meeting_reminder(String.t(), String.t(), String.t(), String.t()) ::
          {String.t(), String.t()}
  def render_meeting_reminder(title, date, time, company) do
    html = render("meeting_reminder.html.eex", title: title, date: date, time: time, company: company)
    {"Påminnelse: möte med " <> company, html}
  end

  @doc """
  Renders a callback-reminder email.

  Returns `{"Påminnelse: återuppringning till <company>", html}`.
  """
  @spec render_callback_reminder(String.t(), String.t(), String.t()) ::
          {String.t(), String.t()}
  def render_callback_reminder(company, phone, callback_time) do
    html = render("callback_reminder.html.eex", company: company, phone: phone, callback_time: callback_time)
    {"Påminnelse: återuppringning till " <> company, html}
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Renders an inner template then wraps it in the layout.
  defp render(template_name, assigns) do
    inner_path = Path.join(@templates_dir, template_name)
    inner_content = EEx.eval_file(inner_path, assigns: assigns)

    layout_path = Path.join(@templates_dir, "layout.html.eex")
    EEx.eval_file(layout_path, assigns: [inner_content: inner_content])
  end
end
