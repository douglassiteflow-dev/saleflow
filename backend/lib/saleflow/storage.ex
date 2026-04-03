defmodule Saleflow.Storage do
  @moduledoc "Cloudflare R2 storage for call recordings."

  def upload(key, data, content_type) do
    if enabled?() do
      bucket()
      |> ExAws.S3.put_object(key, data, content_type: content_type)
      |> ExAws.request()
    else
      {:ok, :noop}
    end
  end

  def presigned_url(key) do
    if enabled?() do
      {:ok, url} =
        ExAws.S3.presigned_url(ExAws.Config.new(:s3), :get, bucket(), key, expires_in: 3600)

      {:ok, url}
    else
      {:ok, "http://localhost/fake/#{key}"}
    end
  end

  defp bucket, do: Application.get_env(:saleflow, :r2_bucket, "saleflow-recordings")
  defp enabled?, do: Application.get_env(:saleflow, :storage_enabled, true)
end
