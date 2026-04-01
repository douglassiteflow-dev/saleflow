defmodule Saleflow.Notifications do
  @moduledoc """
  Notifications domain for SaleFlow.

  Responsible for sending transactional emails via the Resend API.
  Templates are defined in `Saleflow.Notifications.Templates` and
  dispatched through `Saleflow.Notifications.Mailer`.

  ## Quick usage

      # Fire-and-forget (recommended for most cases)
      Saleflow.Notifications.Mailer.send_email_async(
        "user@example.com",
        "Your OTP code",
        html_body
      )

      # Synchronous (when you need to confirm delivery)
      {:ok, _} = Saleflow.Notifications.Mailer.send_email(
        "user@example.com",
        "Your OTP code",
        html_body
      )
  """

  use Ash.Domain

  resources do
  end
end
