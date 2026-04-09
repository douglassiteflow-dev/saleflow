# Script to bulk-upload Telavox recordings to R2 and link to phone_calls.
# Run via: flyctl ssh console -a saleflow-app -C '/app/bin/saleflow eval "Code.eval_file(\"/tmp/bulk_upload.exs\")"'
#
# Expects /tmp/recordings/ to contain pairs:
#   {recording_id}.ogg
#   {recording_id}_metadata.json

recordings_dir = "/tmp/recordings"

metadata_files =
  File.ls!(recordings_dir)
  |> Enum.filter(&String.ends_with?(&1, "_metadata.json"))

IO.puts("Found #{length(metadata_files)} recordings to process")

{:ok, _} = Application.ensure_all_started(:saleflow)

results =
  Enum.reduce(metadata_files, %{matched: 0, unmatched: 0, uploaded: 0, failed: 0}, fn meta_file, acc ->
    recording_id = String.replace(meta_file, "_metadata.json", "")
    ogg_file = Path.join(recordings_dir, "#{recording_id}.ogg")
    meta_path = Path.join(recordings_dir, meta_file)

    with {:ok, meta_json} <- File.read(meta_path),
         {:ok, meta} <- Jason.decode(meta_json),
         true <- File.exists?(ogg_file) do

      # Parse metadata
      timestamp_ms = meta["timestamp"]
      callee = meta["other_part_number"] || ""
      naive = DateTime.from_unix!(timestamp_ms, :millisecond) |> DateTime.to_naive()

      # Find matching phone_call within 2 min window
      case Saleflow.Repo.query(
        """
        SELECT id FROM phone_calls
        WHERE recording_key IS NULL
          AND direction = 'outgoing'
          AND ABS(EXTRACT(EPOCH FROM (received_at - $1::timestamp))) < 120
        ORDER BY ABS(EXTRACT(EPOCH FROM (received_at - $1::timestamp)))
        LIMIT 1
        """,
        [naive]
      ) do
        {:ok, %{rows: [[pc_id_bin]]}} ->
          pc_id = Ecto.UUID.load!(pc_id_bin)
          ogg_data = File.read!(ogg_file)
          key = "recordings/2026/#{String.pad_leading("#{naive.month}", 2, "0")}/#{pc_id}.ogg"

          case Saleflow.Storage.upload(key, ogg_data, "audio/ogg") do
            {:ok, _} ->
              Saleflow.Repo.query(
                "UPDATE phone_calls SET recording_key = $1, recording_id = $2 WHERE id = $3",
                [key, recording_id, pc_id_bin]
              )
              IO.puts("OK: #{recording_id} → #{pc_id}")
              %{acc | matched: acc.matched + 1, uploaded: acc.uploaded + 1}

            {:error, err} ->
              IO.puts("UPLOAD FAIL: #{recording_id} → #{inspect(err)}")
              %{acc | matched: acc.matched + 1, failed: acc.failed + 1}
          end

        {:ok, %{rows: []}} ->
          IO.puts("NO MATCH: #{recording_id} (#{callee} @ #{naive})")
          %{acc | unmatched: acc.unmatched + 1}

        {:error, err} ->
          IO.puts("DB ERROR: #{inspect(err)}")
          %{acc | failed: acc.failed + 1}
      end
    else
      _ ->
        IO.puts("SKIP: #{recording_id} (missing file or bad metadata)")
        acc
    end
  end)

IO.puts("\n=== DONE ===")
IO.puts("Matched: #{results.matched}")
IO.puts("Uploaded: #{results.uploaded}")
IO.puts("Unmatched: #{results.unmatched}")
IO.puts("Failed: #{results.failed}")
