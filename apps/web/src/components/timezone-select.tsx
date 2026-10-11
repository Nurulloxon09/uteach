import { NativeSelect } from "@/components/form-bits";

/** IANA time zones known to this runtime, e.g. "Asia/Tashkent". */
function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Tashkent"];
  }
}

export function TimezoneSelect({
  name,
  id,
  defaultValue,
}: {
  name: string;
  id?: string;
  defaultValue: string;
}) {
  const zones = timeZones();
  if (!zones.includes(defaultValue)) zones.unshift(defaultValue);
  return (
    <NativeSelect name={name} id={id} defaultValue={defaultValue}>
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replaceAll("_", " ")}
        </option>
      ))}
    </NativeSelect>
  );
}
