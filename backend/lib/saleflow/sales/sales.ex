defmodule Saleflow.Sales do
  @moduledoc """
  Sales domain for Saleflow.

  Manages leads and the full sales workflow. Exposes the Lead, Assignment,
  CallLog, Meeting, Quarantine, PhoneCall, LeadList, LeadListAssignment,
  and Request resources.

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
    resource Saleflow.Sales.LeadList
    resource Saleflow.Sales.LeadListAssignment
    resource Saleflow.Sales.Request
    resource Saleflow.Sales.PhoneCall
    resource Saleflow.Sales.Goal
    resource Saleflow.Sales.LeadComment
    resource Saleflow.Sales.Deal
    resource Saleflow.Sales.DemoConfig
    resource Saleflow.Sales.Contact
    resource Saleflow.Sales.Questionnaire
    resource Saleflow.Sales.QuestionnaireTemplate
    resource Saleflow.Notifications.Notification
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

  def create_lead_bulk(params) do
    Saleflow.Sales.Lead
    |> Ash.Changeset.for_create(:create_bulk, params)
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
  Sets `callback_reminded_at` to now on a lead.
  """
  @spec mark_lead_callback_reminded(Saleflow.Sales.Lead.t()) ::
          {:ok, Saleflow.Sales.Lead.t()} | {:error, Ash.Error.t()}
  def mark_lead_callback_reminded(lead) do
    lead
    |> Ash.Changeset.for_update(:mark_callback_reminded, %{})
    |> Ash.update()
  end

  @doc """
  Updates editable fields on a lead (e.g. telefon_2).
  """
  @spec update_lead_fields(Saleflow.Sales.Lead.t(), map()) ::
          {:ok, Saleflow.Sales.Lead.t()} | {:error, Ash.Error.t()}
  def update_lead_fields(lead, params) do
    lead
    |> Ash.Changeset.for_update(:update_fields, params)
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

  @doc """
  Batch-loads leads by a list of IDs in a single query.

  Returns `{:ok, %{id => lead}}` map so callers can look up leads without N+1 queries.
  """
  @spec get_leads_by_ids(list(Ecto.UUID.t())) ::
          {:ok, %{Ecto.UUID.t() => Saleflow.Sales.Lead.t()}} | {:error, Ash.Error.t()}
  def get_leads_by_ids(ids) when is_list(ids) do
    require Ash.Query

    Saleflow.Sales.Lead
    |> Ash.Query.filter(id in ^ids)
    |> Ash.read()
    |> case do
      {:ok, leads} -> {:ok, Enum.into(leads, %{}, fn l -> {l.id, l} end)}
      error -> error
    end
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
    end
  end

  @doc """
  Returns the active (unreleased) assignment for a given user AND lead, or `nil` if none.
  Scoped to the specific lead to avoid releasing assignments for other leads.
  """
  def get_active_assignment_for_lead(user, lead_id) do
    require Ash.Query

    Saleflow.Sales.Assignment
    |> Ash.Query.filter(user_id == ^user.id and lead_id == ^lead_id and is_nil(released_at))
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [assignment | _]} -> {:ok, assignment}
      {:ok, []} -> {:ok, nil}
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
  Sets `reminded_at` to now on a meeting.
  """
  @spec mark_meeting_reminded(Saleflow.Sales.Meeting.t()) ::
          {:ok, Saleflow.Sales.Meeting.t()} | {:error, Ash.Error.t()}
  def mark_meeting_reminded(meeting) do
    meeting
    |> Ash.Changeset.for_update(:mark_reminded, %{})
    |> Ash.update()
  end

  @doc """
  Updates meeting fields (meeting_date, meeting_time, notes, status).
  """
  @spec update_meeting(Saleflow.Sales.Meeting.t(), map()) ::
          {:ok, Saleflow.Sales.Meeting.t()} | {:error, Ash.Error.t()}
  def update_meeting(meeting, params) do
    meeting
    |> Ash.Changeset.for_update(:update, params)
    |> Ash.update()
  end

  @doc """
  Returns meeting detail: meeting + lead + calls + audit logs for the meeting's lead.
  """
  @spec get_meeting_detail(Ecto.UUID.t()) ::
          {:ok, map()} | {:error, term()}
  def get_meeting_detail(meeting_id) do
    with {:ok, meeting} <- Ash.get(Saleflow.Sales.Meeting, meeting_id),
         {:ok, lead} <- get_lead(meeting.lead_id),
         {:ok, calls} <- list_calls_for_lead(meeting.lead_id),
         {:ok, audit_logs} <- Saleflow.Audit.list_for_resource("Lead", meeting.lead_id) do
      {:ok, %{meeting: meeting, lead: lead, calls: calls, audit_logs: audit_logs}}
    end
  end

  @doc """
  Returns all meetings (all statuses), sorted by meeting_date descending.
  """
  @spec list_all_meetings() ::
          {:ok, list(Saleflow.Sales.Meeting.t())} | {:error, Ash.Error.t()}
  def list_all_meetings do
    require Ash.Query

    Saleflow.Sales.Meeting
    |> Ash.Query.sort(meeting_date: :desc)
    |> Ash.read()
  end

  @doc """
  Returns all meetings for a specific user, sorted by meeting_date descending.
  """
  @spec list_all_meetings_for_user(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.Meeting.t())} | {:error, Ash.Error.t()}
  def list_all_meetings_for_user(user_id) do
    require Ash.Query

    Saleflow.Sales.Meeting
    |> Ash.Query.filter(user_id == ^user_id)
    |> Ash.Query.sort(meeting_date: :desc)
    |> Ash.read()
  end

  @doc """
  Returns upcoming scheduled meetings (status = `:scheduled`, date >= today),
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
  Returns upcoming scheduled meetings for a specific user (status = `:scheduled`,
  date >= today), sorted by meeting_date ascending.
  """
  @spec list_upcoming_meetings_for_user(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.Meeting.t())} | {:error, Ash.Error.t()}
  def list_upcoming_meetings_for_user(user_id) do
    require Ash.Query

    today = Date.utc_today()

    Saleflow.Sales.Meeting
    |> Ash.Query.filter(
      status == :scheduled and meeting_date >= ^today and user_id == ^user_id
    )
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
      agent_id_binary = Ecto.UUID.dump!(agent.id)

      query = """
      SELECT l.id FROM leads l
      WHERE (l.status = 'new' OR (l.status = 'quarantine' AND l.quarantine_until < NOW()))
        AND NOT EXISTS (
          SELECT 1 FROM assignments a
          WHERE a.lead_id = l.id AND a.released_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM call_logs cl
          WHERE cl.lead_id = l.id
            AND cl.user_id = $1
            AND cl.outcome = 'skipped'
            AND cl.called_at > NOW() - INTERVAL '24 hours'
        )
        AND (
          -- If the agent has no list assignments, they can access all leads
          NOT EXISTS (SELECT 1 FROM lead_list_assignments lla WHERE lla.user_id = $1)
          OR
          -- Otherwise, only leads from the agent's assigned active lists
          l.lead_list_id IN (
            SELECT lla.lead_list_id FROM lead_list_assignments lla
            JOIN lead_lists ll ON ll.id = lla.lead_list_id
            WHERE lla.user_id = $1 AND ll.status = 'active'
          )
        )
      ORDER BY l.inserted_at ASC
      LIMIT 1
      FOR UPDATE OF l SKIP LOCKED
      """

      case Saleflow.Repo.query(query, [agent_id_binary]) do
        {:ok, %{rows: [[lead_id_binary]]}} ->
          lead_id = decode_uuid(lead_id_binary)

          # Release any previous active assignment for this agent
          release_active_assignment(agent)

          # Create new assignment (still inside the transaction holding the row lock)
          lead_id_binary_insert = Ecto.UUID.dump!(lead_id)
          now = DateTime.utc_now()

          {:ok, _} =
            Saleflow.Repo.query(
              "INSERT INTO assignments (id, lead_id, user_id, assigned_at) VALUES ($1, $2, $3, $4)",
              [Ecto.UUID.dump!(Ecto.UUID.generate()), lead_id_binary_insert, agent_id_binary, now]
            )

          # Update lead status to :assigned
          {:ok, _} =
            Saleflow.Repo.query(
              "UPDATE leads SET status = 'assigned', updated_at = $1 WHERE id = $2",
              [now, lead_id_binary_insert]
            )

          # Fetch and return the updated lead
          {:ok, lead} = get_lead(lead_id)
          lead

        {:ok, %{rows: []}} ->
          nil

        {:error, error} ->
          Saleflow.Repo.rollback(error)
      end
    end)
  end

  # ---------------------------------------------------------------------------
  # LeadList functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a new lead list.

  Required params: `:name`
  Optional params: `:description`
  """
  @spec create_lead_list(map()) :: {:ok, Saleflow.Sales.LeadList.t()} | {:error, Ash.Error.t()}
  def create_lead_list(params) do
    Saleflow.Sales.LeadList
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Updates a lead list.

  Accepted params: `:name`, `:description`, `:status`
  """
  @spec update_lead_list(Saleflow.Sales.LeadList.t(), map()) ::
          {:ok, Saleflow.Sales.LeadList.t()} | {:error, Ash.Error.t()}
  def update_lead_list(list, params) do
    list
    |> Ash.Changeset.for_update(:update, params)
    |> Ash.update()
  end

  @doc """
  Returns all lead lists sorted by `inserted_at` descending (newest first).
  """
  @spec list_lead_lists() :: {:ok, list(Saleflow.Sales.LeadList.t())} | {:error, Ash.Error.t()}
  def list_lead_lists do
    Saleflow.Sales.LeadList
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.read()
  end

  @doc """
  Gets a lead list by ID.
  """
  @spec get_lead_list(Ecto.UUID.t()) :: {:ok, Saleflow.Sales.LeadList.t()} | {:error, Ash.Error.t()}
  def get_lead_list(id) do
    Saleflow.Sales.LeadList
    |> Ash.get(id)
  end

  @doc """
  Returns stats breakdown for a lead list: counts per status.
  """
  @spec get_lead_list_stats(Ecto.UUID.t()) :: {:ok, map()} | {:error, term()}
  def get_lead_list_stats(list_id) do
    query = """
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'new') as new,
      COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
      COUNT(*) FILTER (WHERE status = 'meeting_booked') as meeting_booked,
      COUNT(*) FILTER (WHERE status = 'quarantine') as quarantine,
      COUNT(*) FILTER (WHERE status = 'customer') as customer,
      COUNT(*) FILTER (WHERE status = 'bad_number') as bad_number,
      COUNT(*) FILTER (WHERE status = 'callback') as callback
    FROM leads
    WHERE lead_list_id = $1
    """

    case Saleflow.Repo.query(query, [Ecto.UUID.dump!(list_id)]) do
      {:ok, %{rows: [[total, new, assigned, meeting_booked, quarantine, customer, bad_number, callback]]}} ->
        {:ok, %{
          total: total,
          new: new,
          assigned: assigned,
          meeting_booked: meeting_booked,
          quarantine: quarantine,
          customer: customer,
          bad_number: bad_number,
          callback: callback
        }}

      {:ok, %{rows: []}} ->
        {:ok, %{total: 0, new: 0, assigned: 0, meeting_booked: 0, quarantine: 0, customer: 0, bad_number: 0, callback: 0}}

      {:error, error} ->
        {:error, error}
    end
  end

  # ---------------------------------------------------------------------------
  # LeadListAssignment functions
  # ---------------------------------------------------------------------------

  @doc """
  Assigns an agent to a lead list.
  """
  @spec assign_agent_to_list(Ecto.UUID.t(), Ecto.UUID.t()) ::
          {:ok, Saleflow.Sales.LeadListAssignment.t()} | {:error, Ash.Error.t()}
  def assign_agent_to_list(list_id, user_id) do
    Saleflow.Sales.LeadListAssignment
    |> Ash.Changeset.for_create(:create, %{lead_list_id: list_id, user_id: user_id})
    |> Ash.create()
  end

  @doc """
  Removes an agent from a lead list.
  """
  @spec remove_agent_from_list(Ecto.UUID.t(), Ecto.UUID.t()) :: :ok | {:error, Ash.Error.t()}
  def remove_agent_from_list(list_id, user_id) do
    require Ash.Query

    case Saleflow.Sales.LeadListAssignment
         |> Ash.Query.filter(lead_list_id == ^list_id and user_id == ^user_id)
         |> Ash.read() do
      {:ok, [assignment | _]} ->
        case Ash.destroy(assignment) do
          :ok -> :ok
          {:error, error} -> {:error, error}
        end

      {:ok, []} ->
        {:error, :not_found}
    end
  end

  @doc """
  Lists all agents assigned to a given lead list.
  """
  @spec list_agents_for_list(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.LeadListAssignment.t())} | {:error, Ash.Error.t()}
  def list_agents_for_list(list_id) do
    Saleflow.Sales.LeadListAssignment
    |> Ash.Query.for_read(:list_for_list, %{lead_list_id: list_id})
    |> Ash.read()
  end

  @doc """
  Lists all leads in a given list, optionally searching by company name.
  """
  @spec list_leads_in_list(Ecto.UUID.t(), String.t() | nil) ::
          {:ok, list(Saleflow.Sales.Lead.t())} | {:error, Ash.Error.t()}
  def list_leads_in_list(list_id, search \\ nil) do
    require Ash.Query

    query =
      Saleflow.Sales.Lead
      |> Ash.Query.filter(lead_list_id == ^list_id)
      |> Ash.Query.sort(inserted_at: :asc)

    query =
      if search && search != "" do
        Ash.Query.filter(query, contains(företag, ^search))
      else
        query
      end

    Ash.read(query)
  end

  # ---------------------------------------------------------------------------
  # Deal functions
  # ---------------------------------------------------------------------------

  def create_deal(params) do
    Saleflow.Sales.Deal
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def advance_deal(deal) do
    deal
    |> Ash.Changeset.for_update(:advance, %{})
    |> Ash.update()
  end

  def update_deal(deal, params) do
    deal
    |> Ash.Changeset.for_update(:update_fields, params)
    |> Ash.update()
  end

  def get_deal(id) do
    Saleflow.Sales.Deal
    |> Ash.get(id)
  end

  def cancel_deal(deal) do
    deal
    |> Ash.Changeset.for_update(:cancel, %{})
    |> Ash.update()
  end

  def list_deals do
    Saleflow.Sales.Deal
    |> Ash.Query.sort(updated_at: :desc)
    |> Ash.read()
  end

  def list_deals_for_user(user_id) do
    require Ash.Query

    Saleflow.Sales.Deal
    |> Ash.Query.filter(user_id == ^user_id)
    |> Ash.Query.sort(updated_at: :desc)
    |> Ash.read()
  end

  def get_active_deal_for_lead(lead_id) do
    require Ash.Query

    Saleflow.Sales.Deal
    |> Ash.Query.filter(lead_id == ^lead_id and stage != :won and stage != :cancelled)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [deal | _]} -> {:ok, deal}
      {:ok, []} -> {:ok, nil}
      error -> error
    end
  end

  def list_meetings_for_deal(deal_id) do
    require Ash.Query

    Saleflow.Sales.Meeting
    |> Ash.Query.filter(deal_id == ^deal_id)
    |> Ash.Query.sort(meeting_date: :asc, meeting_time: :asc)
    |> Ash.read()
  end

  # ---------------------------------------------------------------------------
  # DemoConfig functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a new demo config for a lead.

  Required params: `:lead_id`, `:user_id`
  Optional params: `:source_url`, `:notes`
  """
  def create_demo_config(params) do
    Saleflow.Sales.DemoConfig
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Transitions a demo config from meeting_booked to generating.
  """
  def start_generation(demo_config) do
    demo_config
    |> Ash.Changeset.for_update(:start_generation, %{})
    |> Ash.update()
  end

  @doc """
  Transitions a demo config from generating to demo_ready,
  saving the website_path and preview_url.
  """
  def generation_complete(demo_config, params) do
    demo_config
    |> Ash.Changeset.for_update(:generation_complete, params)
    |> Ash.update()
  end

  @doc """
  Records a generation failure error on a demo config.
  Stage stays as generating.
  """
  def generation_failed(demo_config, params) do
    demo_config
    |> Ash.Changeset.for_update(:generation_failed, params)
    |> Ash.update()
  end

  @doc """
  Transitions a demo config from demo_ready to demo_held (demo meeting conducted).
  """
  def advance_to_demo_held(demo_config) do
    demo_config
    |> Ash.Changeset.for_update(:advance_to_demo_held, %{})
    |> Ash.update()
  end

  @doc """
  Transitions a demo config from demo_held to followup (followup booked).
  """
  def advance_to_followup(demo_config) do
    demo_config
    |> Ash.Changeset.for_update(:advance_to_followup, %{})
    |> Ash.update()
  end

  @doc """
  Orchestrates the full followup booking flow:

    1. Validates demo_config is in :demo_held
    2. Creates a new Meeting record for the followup
    3. Creates Teams meeting via Microsoft Graph (module configurable via app env)
    4. Creates a Questionnaire tied to the lead
    5. Sends custom email (Swedish or English) with all three links
    6. Advances the demo_config to :followup

  `params` must include `:meeting_date`, `:meeting_time`, `:personal_message`
  and may include `:language` (defaults to `"sv"`), `:email` (falls back to
  `lead.epost` if missing) and `:send_copy` (when true, also sends a copy to
  the agent's own email address).

  The outgoing email is sent **synchronously** so that delivery failures surface
  immediately. If the mail cannot be sent, the demo_config is NOT advanced and
  the Meeting/Teams/Questionnaire records are left in place for retry.

  Returns `{:ok, %{demo_config, meeting, questionnaire}}` on success, or
  `{:error, reason}` on any failure.
  """
  def book_followup(demo_config, params, user) do
    language = Map.get(params, :language, "sv")
    send_copy = Map.get(params, :send_copy, false)

    with :ok <- validate_demo_held(demo_config),
         {:ok, lead} <- get_lead(demo_config.lead_id),
         {:ok, recipient_email} <- resolve_recipient_email(lead, params),
         {:ok, ms_conn} <- get_ms_connection_for_book(user),
         {:ok, meeting} <- create_followup_meeting(demo_config, lead, user, params, language),
         {:ok, meeting} <- create_teams_for_followup_meeting(meeting, ms_conn),
         {:ok, questionnaire} <- create_followup_questionnaire(lead, recipient_email),
         :ok <-
           send_followup_email(
             lead,
             meeting,
             questionnaire,
             demo_config,
             user,
             params,
             language,
             recipient_email,
             send_copy
           ),
         {:ok, advanced} <- advance_to_followup(demo_config) do
      {:ok, %{demo_config: advanced, meeting: meeting, questionnaire: questionnaire}}
    end
  end

  defp validate_demo_held(%{stage: :demo_held}), do: :ok
  defp validate_demo_held(_), do: {:error, :invalid_stage}

  defp resolve_recipient_email(lead, params) do
    custom = Map.get(params, :email)

    cond do
      is_binary(custom) and String.trim(custom) != "" -> {:ok, String.trim(custom)}
      is_binary(lead.epost) and lead.epost != "" -> {:ok, lead.epost}
      true -> {:error, :no_email}
    end
  end

  defp get_ms_connection_for_book(user) do
    require Ash.Query

    case Saleflow.Accounts.MicrosoftConnection
         |> Ash.Query.filter(user_id == ^user.id)
         |> Ash.read() do
      {:ok, [conn | _]} ->
        graph_module = Application.get_env(:saleflow, :graph_module, Saleflow.Microsoft.Graph)

        case graph_module.ensure_fresh_token(conn) do
          {:ok, fresh} -> {:ok, fresh}
          _ -> {:error, :no_microsoft_connection}
        end

      _ ->
        {:error, :no_microsoft_connection}
    end
  end

  defp create_followup_meeting(demo_config, lead, user, params, language) do
    title_prefix = if language == "en", do: "Follow-up", else: "Uppföljning"

    create_meeting(%{
      lead_id: lead.id,
      user_id: user.id,
      title: "#{title_prefix} — #{lead.företag}",
      meeting_date: params.meeting_date,
      meeting_time: params.meeting_time,
      duration_minutes: 30,
      demo_config_id: demo_config.id
    })
  end

  defp create_teams_for_followup_meeting(meeting, ms_conn) do
    start_dt = NaiveDateTime.new!(meeting.meeting_date, meeting.meeting_time)
    end_dt = NaiveDateTime.add(start_dt, 1800)

    graph_module = Application.get_env(:saleflow, :graph_module, Saleflow.Microsoft.Graph)

    case graph_module.create_meeting_with_invite(ms_conn.access_token, %{
           subject: meeting.title,
           start_datetime: NaiveDateTime.to_iso8601(start_dt),
           end_datetime: NaiveDateTime.to_iso8601(end_dt),
           # We send our own email — skip Graph's auto-invite
           attendee_email: nil,
           attendee_name: nil
         }) do
      {:ok, %{join_url: join_url, event_id: event_id}} ->
        meeting
        |> Ash.Changeset.for_update(:update_teams, %{
          teams_join_url: join_url,
          teams_event_id: event_id
        })
        |> Ash.update()

      {:error, reason} ->
        {:error, {:teams_failed, reason}}
    end
  end

  defp create_followup_questionnaire(lead, recipient_email) do
    token = Base.url_encode64(:crypto.strong_rand_bytes(32), padding: false)

    create_questionnaire_for_lead(%{
      lead_id: lead.id,
      customer_email: recipient_email,
      token: token
    })
  end

  defp send_followup_email(
         lead,
         meeting,
         questionnaire,
         demo_config,
         user,
         params,
         language,
         recipient_email,
         send_copy
       ) do
    preview_url = demo_config.preview_url || "https://demo.siteflow.se"

    q_base_url = Application.get_env(:saleflow, :questionnaire_base_url, "https://siteflow.se")
    questionnaire_url = "#{q_base_url}/q/#{questionnaire.token}"

    agent_name = user.name || "Siteflow"
    lead_name = lead.vd_namn || lead.företag

    {subject, html} =
      Saleflow.Notifications.FollowupEmail.render(
        %{
          lead_name: lead_name,
          company_name: lead.företag,
          preview_url: preview_url,
          questionnaire_url: questionnaire_url,
          teams_join_url: meeting.teams_join_url,
          meeting_date: Date.to_string(meeting.meeting_date),
          meeting_time: Time.to_string(meeting.meeting_time) |> String.slice(0, 5),
          personal_message: Map.get(params, :personal_message, ""),
          agent_name: agent_name
        },
        language
      )

    case Saleflow.Notifications.Mailer.send_email(recipient_email, subject, html) do
      {:ok, _id} ->
        # Optionally send a copy to the agent. Send synchronously so tests are
        # deterministic, but ignore the result — copy delivery is non-critical.
        agent_email = user_email_string(user)

        if send_copy and agent_email do
          copy_subject = "[Kopia] #{subject}"
          _ = Saleflow.Notifications.Mailer.send_email(agent_email, copy_subject, html)
        end

        :ok

      {:error, reason} ->
        {:error, {:mail_failed, reason}}
    end
  end

  defp user_email_string(%{email: nil}), do: nil
  defp user_email_string(%{email: ""}), do: nil
  defp user_email_string(%{email: %Ash.CiString{} = email}), do: to_string(email)
  defp user_email_string(%{email: email}) when is_binary(email), do: email
  defp user_email_string(_), do: nil

  @doc """
  Cancels a demo config (from any stage).
  """
  def cancel_demo_config(demo_config) do
    demo_config
    |> Ash.Changeset.for_update(:cancel, %{})
    |> Ash.update()
  end

  @doc """
  Gets a demo config by ID.
  """
  def get_demo_config(id) do
    Saleflow.Sales.DemoConfig
    |> Ash.get(id)
  end

  @doc """
  Returns all demo configs.
  """
  def list_demo_configs do
    Saleflow.Sales.DemoConfig
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.read()
  end

  @doc """
  Returns demo configs for a user, excluding cancelled, sorted by inserted_at desc.
  """
  def list_demo_configs_for_user(user_id) do
    require Ash.Query

    Saleflow.Sales.DemoConfig
    |> Ash.Query.filter(user_id == ^user_id and stage != :cancelled)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.read()
  end

  @doc """
  Returns meetings linked to a demo config, sorted by date and time ascending.
  """
  def list_meetings_for_demo_config(demo_config_id) do
    require Ash.Query

    Saleflow.Sales.Meeting
    |> Ash.Query.filter(demo_config_id == ^demo_config_id)
    |> Ash.Query.sort(meeting_date: :asc, meeting_time: :asc)
    |> Ash.read()
  end

  @doc """
  Resets a demo config for retry: clears error, sets stage back to meeting_booked.
  Only works when stage is :generating (with an error).
  """
  def reset_for_retry(demo_config) do
    demo_config
    |> Ash.Changeset.for_update(:reset_for_retry, %{})
    |> Ash.update()
  end

  # ---------------------------------------------------------------------------
  # Contact functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a new contact for a lead.

  Required params: `:lead_id`, `:name`
  Optional params: `:role`, `:phone`, `:email`
  """
  @spec create_contact(map()) :: {:ok, Saleflow.Sales.Contact.t()} | {:error, Ash.Error.t()}
  def create_contact(params) do
    Saleflow.Sales.Contact
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns all contacts for a given lead, sorted by `inserted_at` ascending (oldest first).
  """
  @spec list_contacts_for_lead(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.Contact.t())} | {:error, Ash.Error.t()}
  def list_contacts_for_lead(lead_id) do
    require Ash.Query

    Saleflow.Sales.Contact
    |> Ash.Query.filter(lead_id == ^lead_id)
    |> Ash.Query.sort(inserted_at: :asc)
    |> Ash.read()
  end

  @doc """
  Deletes a contact.
  """
  @spec delete_contact(Saleflow.Sales.Contact.t()) :: :ok | {:error, Ash.Error.t()}
  def delete_contact(contact) do
    Ash.destroy(contact)
  end

  # ---------------------------------------------------------------------------
  # Questionnaire functions
  # ---------------------------------------------------------------------------

  def create_questionnaire(params) do
    Saleflow.Sales.Questionnaire
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def create_questionnaire_for_lead(params) do
    Saleflow.Sales.Questionnaire
    |> Ash.Changeset.for_create(:create_for_lead, params)
    |> Ash.create()
  end

  def mark_questionnaire_opened(questionnaire) do
    questionnaire
    |> Ash.Changeset.for_update(:mark_opened, %{})
    |> Ash.update()
  end

  def latest_questionnaire_for_lead(lead_id) do
    require Ash.Query

    Saleflow.Sales.Questionnaire
    |> Ash.Query.filter(lead_id == ^lead_id)
    |> Ash.Query.sort(inserted_at: :desc)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [q | _]} -> q
      _ -> nil
    end
  end

  def get_questionnaire(id) do
    Saleflow.Sales.Questionnaire
    |> Ash.get(id)
  end

  def get_questionnaire_by_token(token) do
    require Ash.Query

    Saleflow.Sales.Questionnaire
    |> Ash.Query.filter(token == ^token)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [q | _]} -> {:ok, q}
      {:ok, []} -> {:error, :not_found}
      error -> error
    end
  end

  def save_questionnaire_answers(questionnaire, params) do
    questionnaire
    |> Ash.Changeset.for_update(:save_answers, params)
    |> Ash.update()
  end

  def complete_questionnaire(questionnaire) do
    questionnaire
    |> Ash.Changeset.for_update(:complete, %{})
    |> Ash.update()
  end

  def get_questionnaire_for_deal(deal_id) do
    require Ash.Query

    Saleflow.Sales.Questionnaire
    |> Ash.Query.filter(deal_id == ^deal_id)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [q | _]} -> {:ok, q}
      {:ok, []} -> {:ok, nil}
      error -> error
    end
  end

  def decode_uuid(value) when is_binary(value) and byte_size(value) == 16 do
    Ecto.UUID.load!(value)
  end

  defp release_active_assignment(agent) do
    case get_active_assignment(agent) do
      {:ok, nil} -> :ok
      {:ok, assignment} -> release_assignment(assignment, :manual)
    end
  end

  # ---------------------------------------------------------------------------
  # Request functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a bug report or feature request for the given user.

  Required params: `:user_id`, `:type`, `:description`
  """
  @spec create_request(map()) :: {:ok, Saleflow.Sales.Request.t()} | {:error, Ash.Error.t()}
  def create_request(params) do
    Saleflow.Sales.Request
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns all requests sorted by inserted_at desc (admin use).
  """
  @spec list_requests() :: {:ok, list(Saleflow.Sales.Request.t())} | {:error, Ash.Error.t()}
  def list_requests do
    Saleflow.Sales.Request
    |> Ash.Query.for_read(:list_all)
    |> Ash.read()
  end

  @doc """
  Returns requests for a specific user sorted by inserted_at desc.
  """
  @spec list_requests_for_user(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.Request.t())} | {:error, Ash.Error.t()}
  def list_requests_for_user(user_id) do
    Saleflow.Sales.Request
    |> Ash.Query.for_read(:list_for_user, %{user_id: user_id})
    |> Ash.read()
  end

  @doc """
  Updates the status and/or admin_notes on a request (admin use).

  Accepted params: `:status`, `:admin_notes`
  """
  @spec update_request(Saleflow.Sales.Request.t(), map()) ::
          {:ok, Saleflow.Sales.Request.t()} | {:error, Ash.Error.t()}
  def update_request(request, params) do
    request
    |> Ash.Changeset.for_update(:update_status, params)
    |> Ash.update()
  end

  # ---------------------------------------------------------------------------
  # PhoneCall functions
  # ---------------------------------------------------------------------------

  @doc """
  Records a phone call from the Telavox webhook.

  Required params: `:caller`, `:callee`
  Optional params: `:lead_id`, `:user_id`, `:duration`, `:call_log_id`
  """
  @spec create_phone_call(map()) :: {:ok, Saleflow.Sales.PhoneCall.t()} | {:error, Ash.Error.t()}
  def create_phone_call(params) do
    Saleflow.Sales.PhoneCall
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Links ALL recent unlinked outgoing phone_calls for this user (last 15 min)
  to the given call_log_id. One call_log can have multiple phone_calls
  (e.g. agent called two different numbers for the same lead).

  Returns `:ok` on success, `{:error, reason}` on DB failure.
  """
  def link_phone_call_to_log(user_id, call_log_id) do
    require Logger

    uid = Ecto.UUID.dump!(user_id)
    cl_id = Ecto.UUID.dump!(call_log_id)
    cutoff = DateTime.utc_now() |> DateTime.add(-900, :second)

    query = """
    UPDATE phone_calls
    SET call_log_id = $1
    WHERE user_id = $2
      AND received_at > $3
      AND direction = 'outgoing'
      AND call_log_id IS NULL
    """

    case Saleflow.Repo.query(query, [cl_id, uid, cutoff]) do
      {:ok, _} -> :ok

      {:error, reason} ->
        Logger.warning("link_phone_call_to_log failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ---------------------------------------------------------------------------
  # Goal functions
  # ---------------------------------------------------------------------------

  @doc """
  Creates a new goal.

  Required params: `:scope`, `:metric`, `:target_value`, `:set_by_id`, `:period`
  Optional params: `:user_id`, `:active`
  """
  @spec create_goal(map()) :: {:ok, Saleflow.Sales.Goal.t()} | {:error, Ash.Error.t()}
  def create_goal(params) do
    Saleflow.Sales.Goal
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  @doc """
  Returns the effective active goals for a user.

  Fetches all active goals where `user_id` is nil (global) or matches the given
  user. Groups by metric and picks the highest priority per metric:

  1. Admin-set personal goal (set_by_id != user_id)
  2. Self-set personal goal (set_by_id == user_id)
  3. Global goal
  """
  @spec list_active_goals(Ecto.UUID.t()) ::
          {:ok, list(Saleflow.Sales.Goal.t())} | {:error, Ash.Error.t()}
  def list_active_goals(user_id) do
    require Ash.Query

    with {:ok, goals} <-
           Saleflow.Sales.Goal
           |> Ash.Query.filter(active == true and (is_nil(user_id) or user_id == ^user_id))
           |> Ash.read() do
      effective =
        goals
        |> Enum.group_by(& &1.metric)
        |> Enum.map(fn {_metric, metric_goals} ->
          pick_highest_priority(metric_goals, user_id)
        end)

      {:ok, effective}
    end
  end

  defp pick_highest_priority(goals, user_id) do
    # Priority: admin-set personal > self-set personal > global
    admin_personal =
      Enum.find(goals, fn g ->
        g.scope == :personal and g.user_id == user_id and g.set_by_id != user_id
      end)

    self_personal =
      Enum.find(goals, fn g ->
        g.scope == :personal and g.user_id == user_id and g.set_by_id == user_id
      end)

    global = Enum.find(goals, fn g -> g.scope == :global end)

    admin_personal || self_personal || global
  end

  @doc """
  Updates a goal's target_value or active status.
  """
  @spec update_goal(Saleflow.Sales.Goal.t(), map()) ::
          {:ok, Saleflow.Sales.Goal.t()} | {:error, Ash.Error.t()}
  def update_goal(goal, params) do
    goal
    |> Ash.Changeset.for_update(:update, params)
    |> Ash.update()
  end

  @doc """
  Soft-deletes a goal by setting active to false.
  """
  @spec deactivate_goal(Saleflow.Sales.Goal.t()) ::
          {:ok, Saleflow.Sales.Goal.t()} | {:error, Ash.Error.t()}
  def deactivate_goal(goal) do
    goal
    |> Ash.Changeset.for_update(:deactivate, %{})
    |> Ash.update()
  end
end
