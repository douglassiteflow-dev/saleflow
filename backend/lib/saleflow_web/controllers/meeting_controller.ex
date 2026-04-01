defmodule SaleflowWeb.MeetingController do
  use SaleflowWeb, :controller

  alias Saleflow.Sales

  @doc """
  List upcoming meetings (status = :scheduled, date >= today).
  """
  def index(conn, _params) do
    case Sales.list_upcoming_meetings() do
      {:ok, meetings} ->
        json(conn, %{meetings: Enum.map(meetings, &serialize_meeting/1)})

      # coveralls-ignore-start
      {:error, _} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to list meetings"})
      # coveralls-ignore-stop
    end
  end

  @doc """
  Create a new meeting.
  """
  def create(conn, params) do
    user = conn.assigns.current_user

    meeting_params = %{
      lead_id: params["lead_id"],
      user_id: user.id,
      title: params["title"],
      meeting_date: parse_date(params["meeting_date"]),
      meeting_time: parse_time(params["meeting_time"]),
      notes: params["notes"]
    }

    case Sales.create_meeting(meeting_params) do
      {:ok, meeting} ->
        conn
        |> put_status(:created)
        |> json(%{meeting: serialize_meeting(meeting)})

      {:error, _} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to create meeting"})
    end
  end

  @doc """
  Cancel a meeting by ID.
  """
  def cancel(conn, %{"id" => id}) do
    with {:ok, meeting} <- get_meeting(id),
         {:ok, cancelled} <- Sales.cancel_meeting(meeting) do
      json(conn, %{meeting: serialize_meeting(cancelled)})
    else
      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Meeting not found"})

      # coveralls-ignore-start
      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to cancel meeting"})
      # coveralls-ignore-stop
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp get_meeting(id) do
    case Ash.get(Saleflow.Sales.Meeting, id) do
      {:ok, meeting} -> {:ok, meeting}
      {:error, _} -> {:error, :not_found}
    end
  end

  defp serialize_meeting(meeting) do
    %{
      id: meeting.id,
      lead_id: meeting.lead_id,
      user_id: meeting.user_id,
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      meeting_time: meeting.meeting_time,
      notes: meeting.notes,
      status: meeting.status,
      inserted_at: meeting.inserted_at
    }
  end

  defp parse_date(nil), do: Date.utc_today() |> Date.add(1)
  defp parse_date(date_string) when is_binary(date_string) do
    case Date.from_iso8601(date_string) do
      {:ok, date} -> date
      _ -> Date.utc_today() |> Date.add(1)
    end
  end

  defp parse_time(nil), do: ~T[10:00:00]
  defp parse_time(time_string) when is_binary(time_string) do
    case Time.from_iso8601(time_string) do
      {:ok, time} -> time
      _ -> ~T[10:00:00]
    end
  end
end
