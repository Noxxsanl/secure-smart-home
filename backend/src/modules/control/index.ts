// Cửa ra DUY NHẤT của module control: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Danh sách tường minh từ control.facade.ts — worker (command-ack) gắn qua control.module.ts.
export { controlModule } from "./control.module";
export {
  publishOtaCommand,
  registerSimulatedCommandHandler,
  sendDeviceCommand,
  sendGatewayCommand,
} from "./control.facade";
export type {
  CommandChannel,
  CommandSource,
  CommandSummary,
  PublishOtaCommandInput,
  SendDeviceCommandInput,
  SendDeviceCommandResult,
  SendGatewayCommandInput,
  SendGatewayCommandResult,
  SimulatedAck,
  SimulatedCommand,
} from "./control.facade";
