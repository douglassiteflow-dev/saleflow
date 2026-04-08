defmodule SaleflowWeb.Serializers do
  @moduledoc "Shared JSON serialization functions for controllers."

  @doc """
  Full lead serialization with all fields.
  Used across lead, deal, meeting, dashboard, demo_config, and list controllers.
  """
  def serialize_lead(nil), do: nil

  def serialize_lead(lead) do
    %{
      id: lead.id,
      företag: lead.företag,
      telefon: lead.telefon,
      telefon_2: lead.telefon_2,
      epost: lead.epost,
      hemsida: lead.hemsida,
      adress: lead.adress,
      postnummer: lead.postnummer,
      stad: lead.stad,
      bransch: lead.bransch,
      orgnr: lead.orgnr,
      omsättning_tkr: lead.omsättning_tkr,
      vinst_tkr: lead.vinst_tkr,
      anställda: lead.anställda,
      vd_namn: lead.vd_namn,
      bolagsform: lead.bolagsform,
      status: lead.status,
      quarantine_until: lead.quarantine_until,
      callback_at: lead.callback_at,
      källa: lead.källa,
      lead_list_id: lead.lead_list_id,
      imported_at: lead.imported_at,
      inserted_at: lead.inserted_at,
      updated_at: lead.updated_at
    }
  end

  @doc """
  Compact lead summary for embedding inside meeting/deal responses.
  """
  def serialize_lead_summary(nil), do: nil

  def serialize_lead_summary(lead) do
    %{
      id: lead.id,
      företag: lead.företag,
      telefon: lead.telefon,
      epost: lead.epost,
      adress: lead.adress,
      postnummer: lead.postnummer,
      stad: lead.stad,
      bransch: lead.bransch,
      omsättning_tkr: lead.omsättning_tkr,
      vd_namn: lead.vd_namn,
      källa: lead.källa,
      status: lead.status
    }
  end

  @doc """
  Full meeting serialization with all fields (superset of all controller variants).
  Includes teams_join_url, teams_event_id, demo_config_id, deal_id, attendee fields, etc.
  """
  def serialize_meeting(meeting) do
    %{
      id: meeting.id,
      lead_id: meeting.lead_id,
      user_id: meeting.user_id,
      title: meeting.title,
      meeting_date: meeting.meeting_date,
      meeting_time: meeting.meeting_time,
      notes: meeting.notes,
      duration_minutes: meeting.duration_minutes,
      status: meeting.status,
      deal_id: meeting.deal_id,
      reminded_at: meeting.reminded_at,
      teams_join_url: meeting.teams_join_url,
      teams_event_id: meeting.teams_event_id,
      attendee_email: meeting.attendee_email,
      attendee_name: meeting.attendee_name,
      demo_config_id: meeting.demo_config_id,
      updated_at: meeting.updated_at,
      inserted_at: meeting.inserted_at
    }
  end

  @doc """
  Meeting serialization with user_name from a name map.
  """
  def serialize_meeting(meeting, user_names) do
    serialize_meeting(meeting)
    |> Map.put(:user_name, Map.get(user_names, meeting.user_id))
  end

  @doc """
  Meeting serialization enriched with embedded lead summary and user_name.
  Used in meeting index and dashboard.
  """
  def serialize_meeting_with_lead(meeting, lead, user_names) do
    serialize_meeting(meeting)
    |> Map.put(:user_name, Map.get(user_names, meeting.user_id))
    |> Map.put(:lead, serialize_lead_summary(lead))
  end

  @doc """
  Full audit log serialization.
  Accepts either 2 or 3 arguments (the third is ignored for backwards compat).
  """
  def serialize_audit_log(log, user_names, _current_user \\ nil) do
    %{
      id: log.id,
      user_id: log.user_id,
      user_name: Map.get(user_names, log.user_id),
      action: log.action,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      changes: log.changes,
      metadata: log.metadata,
      inserted_at: log.inserted_at
    }
  end

  @doc """
  Call log serialization with phone data.
  Accepts either 2 or 3 arguments (the third is ignored for backwards compat).
  Used across lead_controller and meeting_controller.
  """
  def serialize_call(call, user_names, _current_user \\ nil) do
    {duration, has_recording, phone_call_id, transcription, transcription_analysis} =
      SaleflowWeb.ControllerHelpers.get_call_phone_data(call.id)

    %{
      id: call.id,
      lead_id: call.lead_id,
      user_id: call.user_id,
      user_name: Map.get(user_names, call.user_id),
      outcome: call.outcome,
      notes: call.notes,
      called_at: call.called_at,
      duration: duration,
      has_recording: has_recording,
      phone_call_id: phone_call_id,
      transcription: transcription,
      transcription_analysis: transcription_analysis
    }
  end

  @doc """
  Simple deal serialization (no lead/user name enrichment).
  Used for advance/update responses and as the base for full deal serialization.
  """
  def serialize_deal_simple(deal) do
    %{
      id: deal.id,
      lead_id: deal.lead_id,
      user_id: deal.user_id,
      stage: deal.stage,
      notes: deal.notes,
      website_url: deal.website_url,
      meeting_outcome: deal.meeting_outcome,
      needs_followup: deal.needs_followup,
      domain: deal.domain,
      domain_sponsored: deal.domain_sponsored,
      inserted_at: deal.inserted_at,
      updated_at: deal.updated_at
    }
  end

  @doc """
  Full deal serialization enriched with lead_name and user_name.
  """
  def serialize_deal(deal, nil, user_names) do
    serialize_deal_simple(deal)
    |> Map.put(:lead_name, nil)
    |> Map.put(:user_name, Map.get(user_names, deal.user_id))
  end

  def serialize_deal(deal, lead, user_names) do
    serialize_deal_simple(deal)
    |> Map.put(:lead_name, lead.företag)
    |> Map.put(:user_name, Map.get(user_names, deal.user_id))
  end
end
