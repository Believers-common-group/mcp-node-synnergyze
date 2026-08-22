export interface SensorPassportV1 {
  schema_version: "sensor-passport.v1";
  sensor_id: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  calibration_credential_ids: readonly string[];
  dependency_ids: readonly string[];
  issued_at: string;
}
