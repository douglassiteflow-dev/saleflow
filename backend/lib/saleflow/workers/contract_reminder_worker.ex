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
    unless contract.recipient_email do
      Logger.warning("ContractReminderWorker: contract #{contract.contract_number} has no recipient_email, skipping")
    else
      base_url = Application.get_env(:saleflow, :contract_base_url, "https://siteflow.se")
      link = "#{base_url}/contract/#{contract.access_token}"

      html = """
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 16px;">Påminnelse: Du har ett avtal som väntar</h2>

        <p style="color: #475569; margin-bottom: 16px;">Hej #{contract.recipient_name || ""},</p>
        <p style="color: #475569; margin-bottom: 24px;">Vi vill påminna dig om att du har ett avtal som väntar på din signering.</p>

        <p style="text-align: center; margin: 24px 0;">
          <a href="#{link}" style="background: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            Visa avtalet
          </a>
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Med vänliga hälsningar,<br>Siteflow</p>
      </div>
      """

      Saleflow.Notifications.Mailer.send_email_async(
        contract.recipient_email,
        "Påminnelse: Avtal väntar på signering",
        html
      )

      Logger.info("ContractReminderWorker: sent reminder for contract #{contract.contract_number}")
    end
  end
end
