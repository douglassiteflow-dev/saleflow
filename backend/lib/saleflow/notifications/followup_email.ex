defmodule Saleflow.Notifications.FollowupEmail do
  @moduledoc """
  Renders the followup email (Swedish or English) with preview link,
  questionnaire link, and Teams meeting link.
  """

  require EEx

  @sv_template Path.join(:code.priv_dir(:saleflow), "templates/followup_email_sv.html.eex")
  @en_template Path.join(:code.priv_dir(:saleflow), "templates/followup_email_en.html.eex")

  @external_resource @sv_template
  @external_resource @en_template

  EEx.function_from_file(:defp, :render_sv, @sv_template, [
    :lead_name,
    :preview_url,
    :personal_message,
    :questionnaire_url,
    :meeting_date,
    :meeting_time,
    :teams_join_url,
    :agent_name
  ])

  EEx.function_from_file(:defp, :render_en, @en_template, [
    :lead_name,
    :preview_url,
    :personal_message,
    :questionnaire_url,
    :meeting_date,
    :meeting_time,
    :teams_join_url,
    :agent_name
  ])

  @doc """
  Renders the followup email and returns {subject, html}.
  Language must be "sv" or "en" (defaults to "sv").
  """
  def render(params, language \\ "sv") do
    lang = normalize_language(language)

    subject = subject_for(lang, params.company_name)

    body =
      renderer_for(lang).(
        html_escape(params.lead_name),
        params.preview_url,
        html_escape(params.personal_message),
        params.questionnaire_url,
        html_escape(params.meeting_date),
        html_escape(params.meeting_time),
        params.teams_join_url,
        html_escape(params.agent_name)
      )

    html = Saleflow.Notifications.EmailTemplate.wrap(body)
    {subject, html}
  end

  defp normalize_language("en"), do: "en"
  defp normalize_language(_), do: "sv"

  defp subject_for("en", company), do: "Follow-up — #{company}"
  defp subject_for(_, company), do: "Uppföljning — #{company}"

  defp renderer_for("en"), do: &render_en/8
  defp renderer_for(_), do: &render_sv/8

  defp html_escape(nil), do: ""

  defp html_escape(value) when is_binary(value) do
    value
    |> Phoenix.HTML.html_escape()
    |> Phoenix.HTML.safe_to_string()
  end

  defp html_escape(value), do: to_string(value)
end
