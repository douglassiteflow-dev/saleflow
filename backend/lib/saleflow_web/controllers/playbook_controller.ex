defmodule SaleflowWeb.PlaybookController do
  use SaleflowWeb, :controller

  # GET /api/admin/playbooks — list all
  def index(conn, _params) do
    {:ok, %{rows: rows}} =
      Saleflow.Repo.query(
        "SELECT id, name, opening, pitch, objections, closing, guidelines, active, inserted_at, updated_at FROM playbooks ORDER BY inserted_at DESC"
      )

    playbooks = Enum.map(rows, &serialize_row/1)
    json(conn, %{playbooks: playbooks})
  end

  # GET /api/admin/playbooks/active — get active playbook
  def active(conn, _params) do
    case Saleflow.Repo.query(
           "SELECT id, name, opening, pitch, objections, closing, guidelines, active FROM playbooks WHERE active = true LIMIT 1"
         ) do
      {:ok, %{rows: [row]}} -> json(conn, %{playbook: serialize_row(row)})
      _ -> json(conn, %{playbook: nil})
    end
  end

  # POST /api/admin/playbooks — create
  def create(conn, params) do
    id = Ecto.UUID.generate()

    {:ok, _} =
      Saleflow.Repo.query(
        "INSERT INTO playbooks (id, name, opening, pitch, objections, closing, guidelines, active, inserted_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())",
        [
          Ecto.UUID.dump!(id),
          params["name"],
          params["opening"],
          params["pitch"],
          params["objections"],
          params["closing"],
          params["guidelines"],
          params["active"] || false
        ]
      )

    json(conn, %{ok: true, id: id})
  end

  # PUT /api/admin/playbooks/:id — update
  def update(conn, %{"id" => id} = params) do
    {:ok, _} =
      Saleflow.Repo.query(
        "UPDATE playbooks SET name = $1, opening = $2, pitch = $3, objections = $4, closing = $5, guidelines = $6, active = $7, updated_at = NOW() WHERE id = $8",
        [
          params["name"],
          params["opening"],
          params["pitch"],
          params["objections"],
          params["closing"],
          params["guidelines"],
          params["active"] || false,
          Ecto.UUID.dump!(id)
        ]
      )

    # If this one is active, deactivate others
    if params["active"] do
      Saleflow.Repo.query("UPDATE playbooks SET active = false WHERE id != $1", [
        Ecto.UUID.dump!(id)
      ])
    end

    json(conn, %{ok: true})
  end

  # DELETE /api/admin/playbooks/:id
  def delete(conn, %{"id" => id}) do
    Saleflow.Repo.query("DELETE FROM playbooks WHERE id = $1", [Ecto.UUID.dump!(id)])
    json(conn, %{ok: true})
  end

  defp serialize_row(row) do
    [id, name, opening, pitch, objections, closing, guidelines, active | rest] = row

    base = %{
      id: Ecto.UUID.load!(id),
      name: name,
      opening: opening,
      pitch: pitch,
      objections: objections,
      closing: closing,
      guidelines: guidelines,
      active: active
    }

    case rest do
      [inserted_at, updated_at] ->
        Map.merge(base, %{inserted_at: inserted_at, updated_at: updated_at})

      _ ->
        base
    end
  end
end
