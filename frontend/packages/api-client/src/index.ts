// Lõi gọi API dùng chung cho mọi kênh. DTO + SWR theo kênh: "@shh/api-client/dashboard", "@shh/api-client/portal".
export { FetchError, INVALID_ROUTE_ID_ERROR } from "./errors";
export { api, apiErrorCode, apiFetcher, configureApi } from "./http";
export type { ApiOptions, PortalRole } from "./http";
