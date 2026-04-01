defmodule Saleflow.Sales do
  @moduledoc """
  Sales domain for SaleFlow.

  Manages leads and the full sales workflow. Currently exposes the Lead
  resource. Assignment, CallLog, Meeting, and Quarantine resources will be
  added in Task 5.

  ## Usage

      # Create a lead
      {:ok, lead} = Saleflow.Sales.create_lead(%{
        företag: "Acme AB",
        telefon: "+46701234567"
      })

      # List all leads
      {:ok, leads} = Saleflow.Sales.list_leads()

      # Search by company name
      {:ok, leads} = Saleflow.Sales.search_leads("Acme")

      # Get a specific lead
      {:ok, lead} = Saleflow.Sales.get_lead(lead.id)

      # Update status
      {:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :assigned})

      # Update status to quarantine — quarantine_until is set automatically
      {:ok, lead} = Saleflow.Sales.update_lead_status(lead, %{status: :quarantine})
  """

  use Ash.Domain

  resources do
    resource Saleflow.Sales.Lead
    # Saleflow.Sales.Assignment    — added in Task 5
    # Saleflow.Sales.CallLog       — added in Task 5
    # Saleflow.Sales.Meeting       — added in Task 5
    # Saleflow.Sales.Quarantine    — added in Task 5
  end

  @doc """
  Creates a new lead.

  Required params: `:företag`, `:telefon`
  Optional params: all other Lead fields
  """
  @spec create_lead(map()) :: {:ok, Saleflow.Sales.Lead.t()} | {:error, Ash.Error.t()}
  def create_lead(params) do
    Saleflow.Sales.Lead
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns all leads sorted by `inserted_at` ascending (oldest first).
  """
  @spec list_leads() :: {:ok, list(Saleflow.Sales.Lead.t())} | {:error, Ash.Error.t()}
  def list_leads do
    Saleflow.Sales.Lead
    |> Ash.Query.sort(inserted_at: :asc)
    |> Ash.read()
  end

  @doc """
  Searches leads by company name (case-insensitive substring match on `företag`).

  Returns all leads where `företag` contains `query`, sorted by `inserted_at` ascending.
  """
  @spec search_leads(String.t()) :: {:ok, list(Saleflow.Sales.Lead.t())} | {:error, Ash.Error.t()}
  def search_leads(query) do
    require Ash.Query

    Saleflow.Sales.Lead
    |> Ash.Query.filter(contains(företag, ^query))
    |> Ash.Query.sort(inserted_at: :asc)
    |> Ash.read()
  end

  @doc """
  Updates the status of a lead.

  Accepted params: `:status`, `:quarantine_until`, `:callback_at`

  When `:status` is set to `:quarantine` and `:quarantine_until` is not
  provided, `quarantine_until` is automatically set to 7 days from now.
  """
  @spec update_lead_status(Saleflow.Sales.Lead.t(), map()) ::
          {:ok, Saleflow.Sales.Lead.t()} | {:error, Ash.Error.t()}
  def update_lead_status(lead, params) do
    lead
    |> Ash.Changeset.for_update(:update_status, params)
    |> Ash.update()
  end

  @doc """
  Gets a lead by ID.

  Returns `{:ok, lead}` or `{:error, %Ash.Error.Query.NotFound{}}`.
  """
  @spec get_lead(Ecto.UUID.t()) :: {:ok, Saleflow.Sales.Lead.t()} | {:error, Ash.Error.t()}
  def get_lead(id) do
    Saleflow.Sales.Lead
    |> Ash.get(id)
  end
end
