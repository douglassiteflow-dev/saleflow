defmodule Saleflow.Notifications.TemplatesTest do
  use ExUnit.Case, async: true

  alias Saleflow.Notifications.Templates

  # ---------------------------------------------------------------------------
  # render_otp_code/1
  # ---------------------------------------------------------------------------

  describe "render_otp_code/1" do
    test "returns a {subject, html} tuple" do
      assert {subject, html} = Templates.render_otp_code("123456")
      assert is_binary(subject)
      assert is_binary(html)
    end

    test "subject contains expected text" do
      {subject, _html} = Templates.render_otp_code("123456")
      assert subject =~ "inloggningskod"
      assert subject =~ "Saleflow"
    end

    test "html contains the OTP code" do
      {_subject, html} = Templates.render_otp_code("987654")
      assert html =~ "987654"
    end

    test "html is wrapped in layout (contains Saleflow branding)" do
      {_subject, html} = Templates.render_otp_code("111111")
      assert html =~ "Saleflow"
    end

    test "html is a full HTML document" do
      {_subject, html} = Templates.render_otp_code("222222")
      assert html =~ "<!DOCTYPE html>"
      assert html =~ "</html>"
    end
  end

  # ---------------------------------------------------------------------------
  # render_welcome/2
  # ---------------------------------------------------------------------------

  describe "render_welcome/2" do
    test "returns a {subject, html} tuple" do
      assert {subject, html} = Templates.render_welcome("Anna Svensson", "https://saleflow.se/login")
      assert is_binary(subject)
      assert is_binary(html)
    end

    test "subject contains welcome text" do
      {subject, _html} = Templates.render_welcome("Anna Svensson", "https://saleflow.se/login")
      assert subject =~ "Välkommen"
      assert subject =~ "Saleflow"
    end

    test "html contains user name" do
      {_subject, html} = Templates.render_welcome("Bertil Karlsson", "https://saleflow.se/login")
      assert html =~ "Bertil Karlsson"
    end

    test "html contains login URL" do
      {_subject, html} = Templates.render_welcome("Carl", "https://app.saleflow.se/login?ref=welcome")
      assert html =~ "https://app.saleflow.se/login?ref=welcome"
    end

    test "html is wrapped in layout" do
      {_subject, html} = Templates.render_welcome("Diana", "https://saleflow.se")
      assert html =~ "Saleflow"
      assert html =~ "<!DOCTYPE html>"
    end
  end

  # ---------------------------------------------------------------------------
  # render_force_logout/1
  # ---------------------------------------------------------------------------

  describe "render_force_logout/1" do
    test "returns a {subject, html} tuple" do
      assert {subject, html} = Templates.render_force_logout("Erik Lindqvist")
      assert is_binary(subject)
      assert is_binary(html)
    end

    test "subject references session termination" do
      {subject, _html} = Templates.render_force_logout("Erik Lindqvist")
      assert subject =~ "session"
      assert subject =~ "Saleflow"
    end

    test "html contains user name" do
      {_subject, html} = Templates.render_force_logout("Frida Nilsson")
      assert html =~ "Frida Nilsson"
    end

    test "html mentions being logged out" do
      {_subject, html} = Templates.render_force_logout("Gustav")
      assert html =~ "loggats ut"
    end

    test "html is wrapped in layout" do
      {_subject, html} = Templates.render_force_logout("Hanna")
      assert html =~ "Saleflow"
    end
  end

  # ---------------------------------------------------------------------------
  # render_meeting_reminder/4
  # ---------------------------------------------------------------------------

  describe "render_meeting_reminder/4" do
    test "returns a {subject, html} tuple" do
      assert {subject, html} =
               Templates.render_meeting_reminder(
                 "Säljmöte Q2",
                 "2026-04-15",
                 "10:00",
                 "Acme AB"
               )

      assert is_binary(subject)
      assert is_binary(html)
    end

    test "subject contains company name" do
      {subject, _html} =
        Templates.render_meeting_reminder("Demo", "2026-04-01", "14:00", "Bolaget AB")

      assert subject =~ "Bolaget AB"
    end

    test "html contains meeting title" do
      {_subject, html} =
        Templates.render_meeting_reminder("Intro-möte", "2026-04-01", "09:00", "Företaget")

      assert html =~ "Intro-möte"
    end

    test "html contains date and time" do
      {_subject, html} =
        Templates.render_meeting_reminder("Q3 Kick-off", "2026-07-01", "11:30", "StartupAB")

      assert html =~ "2026-07-01"
      assert html =~ "11:30"
    end

    test "html contains company name" do
      {_subject, html} =
        Templates.render_meeting_reminder("Möte", "2026-05-05", "15:00", "Kunden AB")

      assert html =~ "Kunden AB"
    end

    test "html is wrapped in layout" do
      {_subject, html} =
        Templates.render_meeting_reminder("Test", "2026-01-01", "08:00", "Test AB")

      assert html =~ "Saleflow"
    end
  end

  # ---------------------------------------------------------------------------
  # render_callback_reminder/3
  # ---------------------------------------------------------------------------

  describe "render_callback_reminder/3" do
    test "returns a {subject, html} tuple" do
      assert {subject, html} =
               Templates.render_callback_reminder("Leverantören AB", "+46701234567", "14:00")

      assert is_binary(subject)
      assert is_binary(html)
    end

    test "subject contains company name" do
      {subject, _html} =
        Templates.render_callback_reminder("Kunden Sverige AB", "+46701111111", "09:00")

      assert subject =~ "Kunden Sverige AB"
    end

    test "html contains company name" do
      {_subject, html} =
        Templates.render_callback_reminder("Tech Corp", "+46709876543", "16:30")

      assert html =~ "Tech Corp"
    end

    test "html contains phone number" do
      {_subject, html} =
        Templates.render_callback_reminder("SomeCompany", "+46709998877", "13:00")

      assert html =~ "+46709998877"
    end

    test "html contains callback time" do
      {_subject, html} =
        Templates.render_callback_reminder("AnyCompany", "+46700000000", "17:45")

      assert html =~ "17:45"
    end

    test "html is wrapped in layout" do
      {_subject, html} =
        Templates.render_callback_reminder("X Corp", "+46700001111", "12:00")

      assert html =~ "Saleflow"
    end
  end
end
