defmodule Saleflow.Generation do
  use Ash.Domain

  resources do
    resource Saleflow.Generation.GenerationJob
  end

  def create_job(params) do
    Saleflow.Generation.GenerationJob
    |> Ash.Changeset.for_create(:create, params)
    |> Ash.create()
  end

  def get_next_pending_job do
    require Ash.Query

    Saleflow.Generation.GenerationJob
    |> Ash.Query.filter(status == :pending)
    |> Ash.Query.sort(inserted_at: :asc)
    |> Ash.Query.limit(1)
    |> Ash.read()
    |> case do
      {:ok, [job | _]} -> {:ok, job}
      {:ok, []} -> {:ok, nil}
      error -> error
    end
  end

  def pick_job(job) do
    job |> Ash.Changeset.for_update(:pick, %{}) |> Ash.update()
  end

  def complete_job(job, result_url) do
    job |> Ash.Changeset.for_update(:complete, %{result_url: result_url}) |> Ash.update()
  end

  def fail_job(job, error) do
    job |> Ash.Changeset.for_update(:fail, %{error: error}) |> Ash.update()
  end

  def get_job(id) do
    Saleflow.Generation.GenerationJob |> Ash.get(id)
  end

  def reset_stuck_jobs do
    require Ash.Query

    Saleflow.Generation.GenerationJob
    |> Ash.Query.filter(status == :processing)
    |> Ash.read!()
    |> Enum.map(fn job ->
      job |> Ash.Changeset.for_update(:reset, %{}) |> Ash.update()
    end)
  end
end
