defmodule SaleflowWeb.GenJobController do
  use SaleflowWeb, :controller

  alias Saleflow.Generation

  def pending(conn, _params) do
    case Generation.get_next_pending_job() do
      {:ok, nil} ->
        json(conn, %{job: nil})

      {:ok, job} ->
        json(conn, %{job: serialize(job)})
    end
  end

  def pick(conn, %{"id" => id}) do
    with {:ok, job} <- Generation.get_job(id),
         {:ok, picked} <- Generation.pick_job(job) do
      json(conn, %{job: serialize(picked)})
    else
      _ -> conn |> put_status(422) |> json(%{error: "Could not pick job"})
    end
  end

  def complete(conn, %{"id" => id, "result_url" => result_url}) do
    with {:ok, job} <- Generation.get_job(id),
         {:ok, completed} <- Generation.complete_job(job, result_url) do
      maybe_update_deal(completed)
      json(conn, %{job: serialize(completed)})
    else
      _ -> conn |> put_status(422) |> json(%{error: "Could not complete job"})
    end
  end

  def fail(conn, %{"id" => id, "error" => error_msg}) do
    with {:ok, job} <- Generation.get_job(id),
         {:ok, failed} <- Generation.fail_job(job, error_msg) do
      json(conn, %{job: serialize(failed)})
    else
      _ -> conn |> put_status(422) |> json(%{error: "Could not fail job"})
    end
  end

  defp serialize(job) do
    %{
      id: job.id,
      deal_id: job.deal_id,
      demo_config_id: job.demo_config_id,
      source_url: job.source_url,
      slug: job.slug,
      status: job.status,
      result_url: job.result_url,
      error: job.error,
      picked_up_at: job.picked_up_at,
      completed_at: job.completed_at,
      inserted_at: job.inserted_at
    }
  end

  defp maybe_update_deal(job) do
    if job.deal_id do
      case Saleflow.Sales.get_deal(job.deal_id) do
        {:ok, deal} when deal.stage == :booking_wizard ->
          {:ok, deal} = Saleflow.Sales.update_deal(deal, %{website_url: job.result_url})
          Saleflow.Sales.advance_deal(deal)
        _ -> :ok
      end
    end
  end
end
