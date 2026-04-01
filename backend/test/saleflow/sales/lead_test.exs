defmodule Saleflow.Sales.LeadTest do
  use Saleflow.DataCase, async: true

  alias Saleflow.Sales

  @valid_params %{
    företag: "Acme AB",
    telefon: "+46701234567"
  }

  # ---------------------------------------------------------------------------
  # create_lead/1
  # ---------------------------------------------------------------------------

  describe "create_lead/1" do
    test "creates a lead with valid required params" do
      assert {:ok, lead} = Sales.create_lead(@valid_params)
      assert lead.företag == "Acme AB"
      assert lead.telefon == "+46701234567"
      assert lead.status == :new
      refute is_nil(lead.id)
      refute is_nil(lead.inserted_at)
    end

    test "creates a lead with all optional fields" do
      params =
        Map.merge(@valid_params, %{
          epost: "info@acme.se",
          hemsida: "https://acme.se",
          adress: "Storgatan 1",
          postnummer: "11122",
          stad: "Stockholm",
          bransch: "IT",
          orgnr: "556000-0001",
          omsättning_tkr: "5000",
          vinst_tkr: "1000",
          anställda: "25",
          vd_namn: "Anna Svensson",
          bolagsform: "AB",
          status: :new
        })

      assert {:ok, lead} = Sales.create_lead(params)
      assert lead.epost == "info@acme.se"
      assert lead.stad == "Stockholm"
      assert lead.vd_namn == "Anna Svensson"
    end

    test "rejects missing företag" do
      params = Map.delete(@valid_params, :företag)
      assert {:error, _error} = Sales.create_lead(params)
    end

    test "rejects missing telefon" do
      params = Map.delete(@valid_params, :telefon)
      assert {:error, _error} = Sales.create_lead(params)
    end

    test "rejects missing both required fields" do
      assert {:error, _error} = Sales.create_lead(%{})
    end

    test "defaults status to :new" do
      assert {:ok, lead} = Sales.create_lead(@valid_params)
      assert lead.status == :new
    end
  end

  # ---------------------------------------------------------------------------
  # list_leads/0
  # ---------------------------------------------------------------------------

  describe "list_leads/0" do
    test "returns an empty list when there are no leads" do
      assert {:ok, []} = Sales.list_leads()
    end

    test "returns all leads" do
      {:ok, _} = Sales.create_lead(%{företag: "Alpha AB", telefon: "+46700000001"})
      {:ok, _} = Sales.create_lead(%{företag: "Beta AB", telefon: "+46700000002"})
      {:ok, _} = Sales.create_lead(%{företag: "Gamma AB", telefon: "+46700000003"})

      assert {:ok, leads} = Sales.list_leads()
      assert length(leads) == 3
    end

    test "returns leads sorted by inserted_at ascending" do
      {:ok, first} = Sales.create_lead(%{företag: "First AB", telefon: "+46700000001"})
      {:ok, second} = Sales.create_lead(%{företag: "Second AB", telefon: "+46700000002"})

      assert {:ok, leads} = Sales.list_leads()
      ids = Enum.map(leads, & &1.id)
      assert ids == [first.id, second.id]
    end
  end

  # ---------------------------------------------------------------------------
  # search_leads/1
  # ---------------------------------------------------------------------------

  describe "search_leads/1" do
    test "returns leads matching the company name substring" do
      {:ok, _} = Sales.create_lead(%{företag: "Acme AB", telefon: "+46700000001"})
      {:ok, _} = Sales.create_lead(%{företag: "Beta Konsult", telefon: "+46700000002"})
      {:ok, _} = Sales.create_lead(%{företag: "Acme Nordic", telefon: "+46700000003"})

      assert {:ok, leads} = Sales.search_leads("Acme")
      names = Enum.map(leads, & &1.företag)
      assert "Acme AB" in names
      assert "Acme Nordic" in names
      refute "Beta Konsult" in names
    end

    test "returns empty list when no match" do
      {:ok, _} = Sales.create_lead(@valid_params)

      assert {:ok, []} = Sales.search_leads("ZZZ_no_match")
    end

    test "returns all leads when query matches all" do
      {:ok, _} = Sales.create_lead(%{företag: "AB Foo", telefon: "+46700000001"})
      {:ok, _} = Sales.create_lead(%{företag: "AB Bar", telefon: "+46700000002"})

      assert {:ok, leads} = Sales.search_leads("AB")
      assert length(leads) == 2
    end
  end

  # ---------------------------------------------------------------------------
  # update_lead_status/2
  # ---------------------------------------------------------------------------

  describe "update_lead_status/2" do
    test "changes lead status" do
      {:ok, lead} = Sales.create_lead(@valid_params)
      assert {:ok, updated} = Sales.update_lead_status(lead, %{status: :assigned})
      assert updated.status == :assigned
    end

    test "updates status to callback" do
      {:ok, lead} = Sales.create_lead(@valid_params)
      callback_time = DateTime.utc_now() |> DateTime.add(1, :hour) |> DateTime.truncate(:microsecond)
      assert {:ok, updated} = Sales.update_lead_status(lead, %{status: :callback, callback_at: callback_time})
      assert updated.status == :callback
      assert updated.callback_at == callback_time
    end

    test "auto-sets quarantine_until to 7 days when status is :quarantine" do
      {:ok, lead} = Sales.create_lead(@valid_params)
      before_update = DateTime.utc_now()

      assert {:ok, updated} = Sales.update_lead_status(lead, %{status: :quarantine})
      assert updated.status == :quarantine
      refute is_nil(updated.quarantine_until)

      # quarantine_until should be approximately 7 days from now
      expected_lower = DateTime.add(before_update, 6, :day)
      expected_upper = DateTime.add(before_update, 8, :day)

      assert DateTime.compare(updated.quarantine_until, expected_lower) == :gt
      assert DateTime.compare(updated.quarantine_until, expected_upper) == :lt
    end

    test "respects explicit quarantine_until when provided with :quarantine status" do
      {:ok, lead} = Sales.create_lead(@valid_params)
      explicit_time = DateTime.utc_now() |> DateTime.add(30, :day) |> DateTime.truncate(:microsecond)

      assert {:ok, updated} =
               Sales.update_lead_status(lead, %{status: :quarantine, quarantine_until: explicit_time})

      assert updated.status == :quarantine
      assert updated.quarantine_until == explicit_time
    end

    test "does not touch quarantine_until for non-quarantine statuses" do
      {:ok, lead} = Sales.create_lead(@valid_params)
      assert {:ok, updated} = Sales.update_lead_status(lead, %{status: :bad_number})
      assert updated.status == :bad_number
      assert is_nil(updated.quarantine_until)
    end
  end

  # ---------------------------------------------------------------------------
  # get_lead/1
  # ---------------------------------------------------------------------------

  describe "get_lead/1" do
    test "returns the lead by id" do
      {:ok, lead} = Sales.create_lead(@valid_params)
      assert {:ok, found} = Sales.get_lead(lead.id)
      assert found.id == lead.id
      assert found.företag == lead.företag
    end

    test "returns error when lead not found" do
      missing_id = "00000000-0000-0000-0000-000000000000"
      assert {:error, _} = Sales.get_lead(missing_id)
    end
  end

  # ---------------------------------------------------------------------------
  # Audit log integration
  # ---------------------------------------------------------------------------

  describe "audit log" do
    test "creates an audit log entry when a lead is created" do
      assert {:ok, lead} = Sales.create_lead(@valid_params)

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Lead", lead.id)
      assert length(logs) >= 1

      created_log = Enum.find(logs, fn l -> l.action == "lead.created" end)
      refute is_nil(created_log)
      assert created_log.resource_type == "Lead"
      assert created_log.resource_id == lead.id
    end

    test "creates an audit log entry when lead status is updated" do
      {:ok, lead} = Sales.create_lead(@valid_params)
      {:ok, _updated} = Sales.update_lead_status(lead, %{status: :assigned})

      assert {:ok, logs} = Saleflow.Audit.list_for_resource("Lead", lead.id)
      status_log = Enum.find(logs, fn l -> l.action == "lead.status_changed" end)
      refute is_nil(status_log)
    end
  end
end
