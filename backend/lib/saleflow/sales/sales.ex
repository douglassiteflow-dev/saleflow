defmodule Saleflow.Sales do
  @moduledoc """
  Sales domain for SaleFlow.

  Manages leads and the full sales workflow. Exposes the Lead, Assignment,
  CallLog, Meeting, and Quarantine resources.

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

      # Assign a lead to a user
      {:ok, assignment} = Saleflow.Sales.assign_lead(lead, user)

      # Release an assignment
      {:ok, assignment} = Saleflow.Sales.release_assignment(assignment, :manual)

      # Log a call
      {:ok, call} = Saleflow.Sales.log_call(%{lead_id: lead.id, user_id: user.id, outcome: :callback})

      # Book a meeting
      {:ok, meeting} = Saleflow.Sales.create_meeting(%{
        lead_id: lead.id,
        user_id: user.id,
        title: "Demo",
        meeting_date: ~D[2026-05-01],
        meeting_time: ~T[10:00:00]
      })

      # Quarantine a lead
      {:ok, q} = Saleflow.Sales.create_quarantine(%{
        lead_id: lead.id,
        user_id: user.id,
        reason: "Do not call — requested by prospect"
      })
  """

  use Ash.Domain

  resources do
    resource Saleflow.Sales.Lead
    resource Saleflow.Sales.Assignment
    resource Saleflow.Sales.CallLog
    resource Saleflow.Sales.Meeting
    resource Saleflow.Sales.Quarantine
  end

  # ---------------------------------------------------------------------------
  # Lead functions
  # ---------------------------------------------------------------------------

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

  # ---------------------------------------------------------------------------
  # Assignment functions
  # ---------------------------------------------------------------------------

  @doc """
  Assigns a lead to a user, creating an Assignment record.
  """
  @spec assign_lead(Saleflow.Sales.Lead.t(), Saleflow.Accounts.User.t()) ::
          {:ok, Saleflow.Sales.Assignment.t()} | {:error, Ash.Error.t()}
  def assign_lead(lead, user) do
    Saleflow.Sales.Assignment
    |> Ash.Changeset.for_create(:assign, %{lead_id: lead.id, user_id: user.id})
    |> Ash.create()
  end

  @doc """
  Releases an assignment, recording the reason.

  `reason` must be one of: `:outcome_logged`, `:timeout`, `:manual`
  """
  @spec release_assignment(Saleflow.Sales.Assignment.t(), atom()) ::
          {:ok, Saleflow.Sales.Assignment.t()} | {:error, Ash.Error.t()}
  def release_assignment(assignment, reason) do
    assignment
    |> Ash.Changeset.for_update(:release, %{release_reason: reason})
    |> Ash.update()
  end

  @doc """
  Returns the active (unreleased) assignment for a given user, or `nil` if none.
  """
  @spec get_active_assignment(Saleflow.Accounts.User.t()) ::
          {:ok, Saleflow.Sales.Assignment.t() | nil} | {:error, Ash.Error.t()}
  def get_active_assignment(user) do
    require Ash.Query

    Saleflow.Sales.Assignment
    |> Ash.Query.filter(user_id == ^user.id and is_nil(released_at))
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [assignment | _]} -> {:ok, assignment}
      {:ok, []} -> {:ok, nil}
      # coveralls-ignore-next-line
      {:error, error} -> {:error, error}
    end
  end

  # ---------------------------------------------------------------------------
  # CallLog functions
  # ---------------------------------------------------------------------------

  @doc """
  Logs a call attempt against a lead.

  Required params: `:lead_id`, `:user_id`, `:outcome`
  Optional params: `:notes`
  """
  @spec log_call(map()) :: {:ok, Saleflow.Sales.CallLog.t()} | {:error, Ash.Error.t()}
  def log_call(params) do
    Saleflow.Sales.CallLog
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns all call logs for a given lead, sorted by `called_at` descending (newest first).
  """
  @spec list_calls_for_lead(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.CallLog.t())} | {:error, Ash.Error.t()}
  def list_calls_for_lead(lead_id) do
    require Ash.Query

    Saleflow.Sales.CallLog
    |> Ash.Query.filter(lead_id == ^lead_id)
    |> Ash.Query.sort(called_at: :desc)
    |> Ash.read()
  end

  @doc """
  Returns all call logs made by a given user.
  """
  @spec list_calls_for_user(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.CallLog.t())} | {:error, Ash.Error.t()}
  def list_calls_for_user(user_id) do
    require Ash.Query

    Saleflow.Sales.CallLog
    |> Ash.Query.filter(user_id == ^user_id)
    |> Ash.Query.sort(called_at: :desc)
    |> Ash.read()
  end

  # ---------------------------------------------------------------------------
  # Meeting functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a new meeting.

  Required params: `:lead_id`, `:user_id`, `:title`, `:meeting_date`, `:meeting_time`
  Optional params: `:notes`
  """
  @spec create_meeting(map()) :: {:ok, Saleflow.Sales.Meeting.t()} | {:error, Ash.Error.t()}
  def create_meeting(params) do
    Saleflow.Sales.Meeting
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Cancels a meeting, setting its status to `:cancelled`.
  """
  @spec cancel_meeting(Saleflow.Sales.Meeting.t()) ::
          {:ok, Saleflow.Sales.Meeting.t()} | {:error, Ash.Error.t()}
  def cancel_meeting(meeting) do
    meeting
    |> Ash.Changeset.for_update(:cancel, %{})
    |> Ash.update()
  end

  @doc """
  Marks a meeting as completed, setting its status to `:completed`.
  """
  @spec complete_meeting(Saleflow.Sales.Meeting.t()) ::
          {:ok, Saleflow.Sales.Meeting.t()} | {:error, Ash.Error.t()}
  def complete_meeting(meeting) do
    meeting
    |> Ash.Changeset.for_update(:complete, %{})
    |> Ash.update()
  end

  @doc """
  Returns all upcoming scheduled meetings (status = `:scheduled`, date >= today),
  sorted by meeting_date ascending.
  """
  @spec list_upcoming_meetings() ::
          {:ok, list(Saleflow.Sales.Meeting.t())} | {:error, Ash.Error.t()}
  def list_upcoming_meetings do
    require Ash.Query

    today = Date.utc_today()

    Saleflow.Sales.Meeting
    |> Ash.Query.filter(status == :scheduled and meeting_date >= ^today)
    |> Ash.Query.sort(meeting_date: :asc)
    |> Ash.read()
  end

  @doc """
  Returns all meetings for a given lead, sorted by meeting_date ascending.
  """
  @spec list_meetings_for_lead(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.Meeting.t())} | {:error, Ash.Error.t()}
  def list_meetings_for_lead(lead_id) do
    require Ash.Query

    Saleflow.Sales.Meeting
    |> Ash.Query.filter(lead_id == ^lead_id)
    |> Ash.Query.sort(meeting_date: :asc)
    |> Ash.read()
  end

  # ---------------------------------------------------------------------------
  # Quarantine functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a quarantine record for a lead.

  Required params: `:lead_id`, `:user_id`, `:reason`

  `quarantined_at` is set to now and `released_at` to now + 7 days automatically.
  """
  @spec create_quarantine(map()) :: {:ok, Saleflow.Sales.Quarantine.t()} | {:error, Ash.Error.t()}
  def create_quarantine(params) do
    Saleflow.Sales.Quarantine
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns all active quarantine records (where `released_at` is in the future).
  """
  @spec list_active_quarantines() ::
          {:ok, list(Saleflow.Sales.Quarantine.t())} | {:error, Ash.Error.t()}
  def list_active_quarantines do
    require Ash.Query

    now = DateTime.utc_now()

    Saleflow.Sales.Quarantine
    |> Ash.Query.filter(released_at > ^now)
    |> Ash.Query.sort(released_at: :asc)
    |> Ash.read()
  end

  # ---------------------------------------------------------------------------
  # Lead Queue
  # ---------------------------------------------------------------------------

  @doc """
  Atomically dequeues the next available lead for the given agent.

  Eligibility criteria (evaluated inside a single transaction with
  `FOR UPDATE SKIP LOCKED` on the leads table row):

  - `status = 'new'`, **or**
  - `status = 'quarantine'` and `quarantine_until < NOW()`

  AND there is no active (unreleased) assignment for that lead.

  Leads are returned in `inserted_at ASC` order — oldest first.

  Side-effects performed atomically within the same transaction:

  1. Any existing active assignment for `agent` is released with reason
     `:manual`.
  2. A new `Assignment` record is created linking `agent` to the lead.
  3. The lead's `status` is updated to `:assigned`.

  Returns `{:ok, %Lead{}}` on success, `{:ok, nil}` when the queue is
  empty, or `{:error, reason}` on failure.
  """
  @spec get_next_lead(Saleflow.Accounts.User.t()) ::
          {:ok, Saleflow.Sales.Lead.t() | nil} | {:error, term()}
  def get_next_lead(agent) do
    Saleflow.Repo.transaction(fn ->
      query = """
      SELECT l.id FROM leads l
      WHERE (l.status = 'new' OR (l.status = 'quarantine' AND l.quarantine_until < NOW()))
        AND NOT EXISTS (
          SELECT 1 FROM assignments a
          WHERE a.lead_id = l.id AND a.released_at IS NULL
        )
      ORDER BY l.inserted_at ASC
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED
      """

      case Saleflow.Repo.query(query) do
        {:ok, %{rows: [[lead_id_binary]]}} ->
          lead_id = decode_uuid(lead_id_binary)
          {:ok, lead} = get_lead(lead_id)

          # Release any previous active assignment for this agent
          release_active_assignment(agent)

          # Create new assignment
          {:ok, _assignment} = assign_lead(lead, agent)

          # Update lead status to :assigned
          {:ok, updated_lead} = update_lead_status(lead, %{status: :assigned})
          updated_lead

        {:ok, %{rows: []}} ->
          nil
      end
    end)
  end

  # Decodes a UUID that may come back from a raw Postgres query as either a
  # binary (16-byte) or already as a string (depends on Ecto/Postgrex version).
  defp decode_uuid(value) when is_binary(value) and byte_size(value) == 16 do
    Ecto.UUID.load!(value)
  end

  # coveralls-ignore-start
  defp decode_uuid(value) when is_binary(value) do
    value
  end
  # coveralls-ignore-stop

  defp release_active_assignment(agent) do
    case get_active_assignment(agent) do
      {:ok, nil} -> :ok
      {:ok, assignment} -> release_assignment(assignment, :manual)
      # coveralls-ignore-next-line
      _ -> :ok
    end
  end
end
