defmodule Saleflow.Sales.BookFollowupTest do
  use Saleflow.DataCase, async: false

  alias Saleflow.Sales

  setup do
    Application.put_env(:saleflow, :graph_module, Saleflow.Microsoft.GraphStub)
    Application.delete_env(:saleflow, :graph_stub_response)
    Application.put_env(:saleflow, :mailer_sandbox, true)

    on_exit(fn ->
      Application.delete_env(:saleflow, :graph_module)
      Application.delete_env(:saleflow, :graph_stub_response)
    end)

    :ok
  end

  defp create_user!(attrs \\ %{}) do
    unique = System.unique_integer([:positive])

    default = %{
      email: "user#{unique}@example.com",
      name: "Agent #{unique}",
      password: "Password123!",
      password_confirmation: "Password123!"
    }

    {:ok, user} =
      Saleflow.Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, Map.merge(default, attrs))
      |> Ash.create(authorize?: false)

    user
  end

  defp create_lead!(attrs \\ %{}) do
    unique = System.unique_integer([:positive])
    default = %{företag: "Test AB #{unique}", telefon: "+4670#{unique}", epost: "c#{unique}@e.se"}
    {:ok, lead} = Sales.create_lead(Map.merge(default, attrs))
    lead
  end

  defp setup_demo_held!(lead, user) do
    {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
    {:ok, dc} = Sales.start_generation(dc)
    {:ok, dc} = Sales.generation_complete(dc, %{
      website_path: "https://raw.vercel.app",
      preview_url: "https://demo.siteflow.se/test-slug"
    })
    {:ok, dc} = Sales.advance_to_demo_held(dc)
    dc
  end

  defp create_ms_connection!(user) do
    {:ok, _conn} =
      Saleflow.Accounts.MicrosoftConnection
      |> Ash.Changeset.for_create(:create, %{
        user_id: user.id,
        microsoft_user_id: "ms-user-1",
        email: "ms@e.se",
        access_token: "access-tok",
        refresh_token: "refresh-tok",
        token_expires_at: DateTime.utc_now() |> DateTime.add(3600, :second)
      })
      |> Ash.create(authorize?: false)
  end

  describe "book_followup/3" do
    test "creates meeting, Teams, questionnaire, sends mail, advances to followup" do
      user = create_user!()
      lead = create_lead!(%{epost: "test@example.com"})
      dc = setup_demo_held!(lead, user)
      create_ms_connection!(user)

      assert {:ok, result} =
               Sales.book_followup(
                 dc,
                 %{
                   meeting_date: ~D[2026-04-16],
                   meeting_time: ~T[14:00:00],
                   personal_message: "Tack för idag!",
                   language: "sv"
                 },
                 user
               )

      assert result.demo_config.stage == :followup
      assert result.meeting.title =~ lead.företag
      assert result.meeting.title =~ "Uppföljning"
      assert result.meeting.teams_join_url == "https://teams.stub/join"
      assert result.meeting.teams_event_id == "stub-event-1"
      assert result.meeting.duration_minutes == 30
      assert result.meeting.demo_config_id == dc.id
      assert result.questionnaire.lead_id == lead.id
      assert result.questionnaire.customer_email == "test@example.com"
      assert result.questionnaire.status == :pending
      assert is_binary(result.questionnaire.token)
    end

    test "uses English title when language=en" do
      user = create_user!()
      lead = create_lead!(%{epost: "en@example.com"})
      dc = setup_demo_held!(lead, user)
      create_ms_connection!(user)

      assert {:ok, result} =
               Sales.book_followup(
                 dc,
                 %{
                   meeting_date: ~D[2026-04-16],
                   meeting_time: ~T[14:00:00],
                   personal_message: "Thanks!",
                   language: "en"
                 },
                 user
               )

      assert result.meeting.title =~ "Follow-up"
      refute result.meeting.title =~ "Uppföljning"
    end

    test "defaults to Swedish when language not provided" do
      user = create_user!()
      lead = create_lead!(%{epost: "dflt@example.com"})
      dc = setup_demo_held!(lead, user)
      create_ms_connection!(user)

      assert {:ok, result} =
               Sales.book_followup(
                 dc,
                 %{
                   meeting_date: ~D[2026-04-16],
                   meeting_time: ~T[14:00:00],
                   personal_message: ""
                 },
                 user
               )

      assert result.meeting.title =~ "Uppföljning"
    end

    test "fails with :invalid_stage when demo_config not in demo_held" do
      user = create_user!()
      lead = create_lead!(%{epost: "t@e.se"})
      {:ok, dc} = Sales.create_demo_config(%{lead_id: lead.id, user_id: user.id})
      create_ms_connection!(user)

      assert {:error, :invalid_stage} =
               Sales.book_followup(
                 dc,
                 %{
                   meeting_date: ~D[2026-04-16],
                   meeting_time: ~T[14:00:00],
                   personal_message: "",
                   language: "sv"
                 },
                 user
               )
    end

    test "fails with :no_email when lead has no email" do
      user = create_user!()
      lead = create_lead!(%{epost: nil})
      dc = setup_demo_held!(lead, user)
      create_ms_connection!(user)

      assert {:error, :no_email} =
               Sales.book_followup(
                 dc,
                 %{
                   meeting_date: ~D[2026-04-16],
                   meeting_time: ~T[14:00:00],
                   personal_message: "",
                   language: "sv"
                 },
                 user
               )
    end

    test "fails with :no_microsoft_connection when user has no MS connection" do
      user = create_user!()
      lead = create_lead!(%{epost: "t@e.se"})
      dc = setup_demo_held!(lead, user)
      # No MS connection created

      assert {:error, :no_microsoft_connection} =
               Sales.book_followup(
                 dc,
                 %{
                   meeting_date: ~D[2026-04-16],
                   meeting_time: ~T[14:00:00],
                   personal_message: "",
                   language: "sv"
                 },
                 user
               )
    end

    test "fails with {:teams_failed, reason} when Graph API fails" do
      user = create_user!()
      lead = create_lead!(%{epost: "t@e.se"})
      dc = setup_demo_held!(lead, user)
      create_ms_connection!(user)

      Application.put_env(:saleflow, :graph_stub_response, {:error, :network_error})

      assert {:error, {:teams_failed, :network_error}} =
               Sales.book_followup(
                 dc,
                 %{
                   meeting_date: ~D[2026-04-16],
                   meeting_time: ~T[14:00:00],
                   personal_message: "",
                   language: "sv"
                 },
                 user
               )
    end
  end
end
