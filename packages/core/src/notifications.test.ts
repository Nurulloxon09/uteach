import { describe, expect, it } from "vitest";
import { outboxBackoffSeconds, pickChannel, type ChannelInput } from "./notifications";

describe("outboxBackoffSeconds", () => {
  it("waits 30 s, 2 min, 10 min, 1 h, then gives up after the 5th attempt", () => {
    expect([1, 2, 3, 4, 5, 6].map(outboxBackoffSeconds)).toEqual([30, 120, 600, 3600, null, null]);
  });
});

const linked: ChannelInput = {
  channel: null,
  telegramChatId: 5001,
  telegramBody: "{student} missed {group}",
  telegramEnabled: true,
  phone: "+998901111111",
  smsBody: "{student} missed {group}",
  smsTemplateId: "eskiz-1",
  smsEnabled: true,
  centerSmsEnabled: true,
  smsLeft: 10,
};
const unlinked: ChannelInput = { ...linked, telegramChatId: null };

describe("pickChannel", () => {
  it("prefers Telegram when the recipient is linked", () => {
    expect(pickChannel(linked)).toEqual({ send: true, channel: "telegram" });
  });

  it("falls back to an approved SMS without a link", () => {
    expect(pickChannel(unlinked)).toEqual({ send: true, channel: "sms" });
  });

  it("skips SMS that isn't approved, switched off, over the cap or without a phone", () => {
    expect(pickChannel({ ...unlinked, smsTemplateId: null })).toEqual({
      send: false,
      reason: "sms_not_approved",
    });
    expect(pickChannel({ ...unlinked, centerSmsEnabled: false })).toEqual({
      send: false,
      reason: "sms_off",
    });
    expect(pickChannel({ ...unlinked, smsLeft: 0 })).toEqual({ send: false, reason: "sms_cap" });
    expect(pickChannel({ ...unlinked, phone: null })).toEqual({ send: false, reason: "no_phone" });
  });

  it("skips keys without any template for the recipient", () => {
    expect(pickChannel({ ...unlinked, smsBody: null })).toEqual({
      send: false,
      reason: "no_channel",
    });
  });

  it("respects a key switched off by the center", () => {
    expect(pickChannel({ ...linked, telegramEnabled: false })).toEqual({
      send: false,
      reason: "template_disabled",
    });
    expect(pickChannel({ ...unlinked, smsEnabled: false, telegramBody: null })).toEqual({
      send: false,
      reason: "template_disabled",
    });
  });

  it("keeps an explicit channel", () => {
    expect(pickChannel({ ...linked, channel: "sms" })).toEqual({ send: true, channel: "sms" });
    expect(pickChannel({ ...unlinked, channel: "telegram" })).toEqual({
      send: false,
      reason: "no_channel",
    });
    expect(pickChannel({ ...linked, channel: "email" })).toEqual({
      send: false,
      reason: "unsupported_channel",
    });
  });
});
