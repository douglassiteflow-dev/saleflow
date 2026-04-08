defmodule SaleflowWeb.CallSearchController do
  use SaleflowWeb, :controller

  @doc """
  Full-text search in call transcriptions using PostgreSQL tsvector.
  GET /api/calls/search?q=...&agent=...&from=...&to=...&outcome=...&min_score=...

  Agents see only their own calls; admins see all (optionally filtered by agent).
  Returns highlighted snippets via ts_headline.
  """
  def search(conn, %{"q" => query} = params) when byte_size(query) > 0 do
    user = conn.assigns.current_user
    {filters, query_params} = build_filters(params, user)

    sql = """
      SELECT pc.id, pc.received_at, pc.duration, pc.scorecard_avg, pc.sentiment,
             pc.call_summary, cl.outcome::text, u.name as agent_name,
             ts_headline('swedish', COALESCE(pc.transcription, ''), plainto_tsquery('swedish', $1),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=30') as snippet
      FROM phone_calls pc
      LEFT JOIN call_logs cl ON cl.id = pc.call_log_id
      LEFT JOIN users u ON u.id = pc.user_id
      WHERE pc.transcription IS NOT NULL
        AND to_tsvector('swedish', pc.transcription) @@ plainto_tsquery('swedish', $1)
        #{filters}
      ORDER BY ts_rank(to_tsvector('swedish', pc.transcription), plainto_tsquery('swedish', $1)) DESC
      LIMIT 50
    """

    case Saleflow.Repo.query(sql, [query | query_params]) do
      {:ok, %{rows: rows}} ->
        results =
          Enum.map(rows, fn [id, at, dur, score, sent, summary, outcome, agent, snippet] ->
            %{
              id: Ecto.UUID.load!(id),
              received_at: at,
              duration: dur,
              scorecard_avg: score,
              sentiment: sent,
              summary: summary,
              outcome: outcome,
              agent_name: agent,
              snippet: snippet
            }
          end)

        json(conn, %{results: results})

      {:error, _} ->
        json(conn, %{results: []})
    end
  end

  def search(conn, _params) do
    conn |> put_status(400) |> json(%{error: "Sokord kravs (q-parameter)"})
  end

  defp build_filters(params, user) do
    {filters, values, idx} = {"", [], 2}

    {filters, values, idx} =
      if user.role != :admin do
        {filters <> " AND pc.user_id = $#{idx}", values ++ [Ecto.UUID.dump!(user.id)], idx + 1}
      else
        case params["agent"] do
          nil -> {filters, values, idx}
          agent_id -> {filters <> " AND pc.user_id = $#{idx}", values ++ [Ecto.UUID.dump!(agent_id)], idx + 1}
        end
      end

    {filters, values, idx} =
      case params["from"] do
        nil ->
          {filters, values, idx}

        from ->
          {:ok, date} = Date.from_iso8601(from)
          {filters <> " AND pc.received_at::date >= $#{idx}", values ++ [date], idx + 1}
      end

    {filters, values, idx} =
      case params["to"] do
        nil ->
          {filters, values, idx}

        to ->
          {:ok, date} = Date.from_iso8601(to)
          {filters <> " AND pc.received_at::date <= $#{idx}", values ++ [date], idx + 1}
      end

    {filters, values, idx} =
      case params["outcome"] do
        nil -> {filters, values, idx}
        outcome -> {filters <> " AND cl.outcome::text = $#{idx}", values ++ [outcome], idx + 1}
      end

    {filters, values, _idx} =
      case params["min_score"] do
        nil ->
          {filters, values, idx}

        score ->
          {score_f, _} = Float.parse(score)
          {filters <> " AND pc.scorecard_avg >= $#{idx}", values ++ [score_f], idx + 1}
      end

    {filters, values}
  end
end
