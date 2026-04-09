defmodule Saleflow.Notifications.FollowupEmailTest do
  use ExUnit.Case, async: true

  alias Saleflow.Notifications.FollowupEmail

  defp base_params(overrides \\ %{}) do
    Map.merge(
      %{
        lead_name: "Misha Kovtunenko",
        company_name: "Misha's Massage",
        preview_url: "https://demo.siteflow.se/sakura",
        questionnaire_url: "https://siteflow.se/q/abc123",
        teams_join_url: "https://teams.microsoft.com/l/meetup/abc",
        meeting_date: "2026-04-16",
        meeting_time: "14:00",
        personal_message: "Tack för idag!",
        agent_name: "Milad"
      },
      overrides
    )
  end

  describe "render/2 — Swedish" do
    test "renders Swedish email with all fields" do
      {subject, html} = FollowupEmail.render(base_params(), "sv")

      assert subject == "Uppföljning — Misha's Massage"
      assert html =~ "Hej Misha Kovtunenko"
      assert html =~ "Tack för ett trevligt demo-möte"
      assert html =~ "Visa din hemsida"
      assert html =~ "Fyll i formuläret"
      assert html =~ "Anslut till Teams-mötet"
      assert html =~ "https://demo.siteflow.se/sakura"
      assert html =~ "https://siteflow.se/q/abc123"
      assert html =~ "https://teams.microsoft.com/l/meetup/abc"
      assert html =~ "2026-04-16"
      assert html =~ "14:00"
      assert html =~ "Milad"
    end

    test "includes personal message block when present" do
      {_, html} = FollowupEmail.render(base_params(%{personal_message: "Tack för idag Misha!"}), "sv")
      assert html =~ "Tack för idag Misha!"
      assert html =~ "border-left: 3px solid"
    end

    test "omits personal message block when empty" do
      {_, html} = FollowupEmail.render(base_params(%{personal_message: ""}), "sv")
      refute html =~ "border-left: 3px solid"
    end
  end

  describe "render/2 — English" do
    test "renders English email with all fields" do
      {subject, html} = FollowupEmail.render(base_params(), "en")

      assert subject == "Follow-up — Misha's Massage"
      assert html =~ "Hi Misha Kovtunenko"
      assert html =~ "Thanks for a great demo meeting"
      assert html =~ "View your website"
      assert html =~ "Fill in the form"
      assert html =~ "Join the Teams meeting"
      assert html =~ "https://demo.siteflow.se/sakura"
    end
  end

  describe "render/2 — language fallback" do
    test "defaults to Swedish when language not provided" do
      {subject, html} = FollowupEmail.render(base_params())
      assert subject =~ "Uppföljning"
      assert html =~ "Hej"
    end

    test "falls back to Swedish for unknown language" do
      {subject, html} = FollowupEmail.render(base_params(), "fr")
      assert subject =~ "Uppföljning"
      assert html =~ "Hej"
    end
  end

  describe "render/2 — HTML escaping" do
    test "escapes HTML in personal message" do
      {_, html} = FollowupEmail.render(base_params(%{personal_message: "Hej <script>alert(1)</script>"}), "sv")
      refute html =~ "<script>alert"
      assert html =~ "&lt;script&gt;"
    end

    test "escapes HTML in lead_name" do
      {_, html} = FollowupEmail.render(base_params(%{lead_name: "<b>Evil</b>"}), "sv")
      refute html =~ "<b>Evil</b>"
      assert html =~ "&lt;b&gt;Evil&lt;/b&gt;"
    end

    test "subject does not escape company name (it's not HTML output)" do
      {subject, _} = FollowupEmail.render(base_params(%{company_name: "A & B Co"}), "sv")
      # Subject is plain text; & is passed through
      assert subject == "Uppföljning — A & B Co"
    end
  end
end
