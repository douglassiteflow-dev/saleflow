defmodule Saleflow.Workers.ContractReminderWorker do
  @moduledoc """
  Sends reminder emails for unsigned contracts.

  Runs daily at 09:00 via Oban cron. Finds contracts with status :sent or :draft
  that have not been updated in 3+ days, and sends a reminder email to the recipient.
  """

  use Oban.Worker, queue: :default

  require Logger

  @impl Oban.Worker
  def perform(_job) do
    three_days_ago = DateTime.utc_now() |> DateTime.add(-3 * 24 * 60 * 60, :second)

    require Ash.Query

    case Saleflow.Contracts.Contract
         |> Ash.Query.filter(status in [:sent, :draft] and updated_at < ^three_days_ago)
         |> Ash.read() do
      {:ok, contracts} ->
        Logger.info("ContractReminderWorker: found #{length(contracts)} contracts needing reminders")

        for contract <- contracts do
          send_reminder_email(contract)
        end

        :ok

      {:error, reason} ->
        Logger.error("ContractReminderWorker: failed to query contracts: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp send_reminder_email(contract) do
    alias Saleflow.Notifications.EmailTemplate

    unless contract.recipient_email do
      Logger.warning("ContractReminderWorker: contract #{contract.contract_number} has no recipient_email, skipping")
    else
      base_url = Application.get_env(:saleflow, :contract_base_url, "https://siteflow.se")
      link = "#{base_url}/contract/#{contract.access_token}"

      body = """
      <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 16px;">Påminnelse: Du har ett avtal som väntar</h2>

      <p style="color: #475569; margin-bottom: 16px;">Hej #{contract.recipient_name || ""},</p>
      <p style="color: #475569; margin-bottom: 24px;">Vi vill påminna dig om att du har ett avtal som väntar på din signering.</p>

      #{EmailTemplate.button("Visa avtalet", link)}
      """

      Saleflow.Notifications.Mailer.send_email_async(
        contract.recipient_email,
        "Påminnelse: Avtal väntar på signering",
        EmailTemplate.wrap(body)
      )

      Logger.info("ContractReminderWorker: sent reminder for contract #{contract.contract_number}")
    end
  end
end
