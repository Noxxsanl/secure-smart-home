// Facade của module control: hàm/kiểu mà module khác được gọi (qua index.ts).
//   automation → sendDeviceCommand · ota → publishOtaCommand · camera → publishSessionCommand · simulator → registerSimulatedCommandHandler.
export { sendDeviceCommand } from "./features/send-device-command/send-device-command.handler";
export { sendGatewayCommand } from "./features/send-gateway-command/send-gateway-command.handler";
export { publishOtaCommand } from "./features/publish-ota-command/publish-ota-command.handler";
export { publishSessionCommand } from "./features/publish-session-command/publish-session-command.handler";
export { registerSimulatedCommandHandler } from "./domain/simulated-command";
export type {
  CommandChannel,
  CommandSource,
  CommandSummary,
  PublishOtaCommandInput,
  PublishSessionCommandInput,
  SendDeviceCommandInput,
  SendDeviceCommandResult,
  SendGatewayCommandInput,
  SendGatewayCommandResult,
  SimulatedAck,
  SimulatedCommand,
} from "./domain/command.types";
