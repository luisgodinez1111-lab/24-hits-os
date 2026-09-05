import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Env } from "@24hits/config";
import { ENV } from "../config/app-config.module.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Public } from "../common/decorators/public.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CustomerService } from "./customer.service.js";
import { OrderService } from "./order.service.js";
import { DeliveryTrackingService } from "./delivery-tracking.service.js";
import { TrackingTokenService } from "./tracking-token.service.js";
import { PaymentService } from "../cash/payment.service.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
  inactiveCustomersQuerySchema,
  createOrderSchema,
  updateDeliverySchema,
  driverLocationSchema,
  cashHandoverSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type InactiveCustomersQuery,
  type CreateOrderInput,
  type UpdateDeliveryInput,
  type DriverLocationInput,
  type CashHandoverInput,
} from "./sales.dto.js";

@ApiTags("customers")
@Controller("customers")
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  @RequirePermissions("customers.read")
  list(@CurrentUser() u: AuthContext) {
    return this.customers.list(u.organizationId!);
  }

  // Clientes que dejaron de comprar (>= N días sin comprar). Antes de :id.
  @Get("inactive")
  @RequirePermissions("customers.read")
  inactive(@CurrentUser() u: AuthContext, @Query(new ZodValidationPipe(inactiveCustomersQuerySchema)) q: InactiveCustomersQuery) {
    return this.customers.inactive(u.organizationId!, q.days);
  }

  @Get(":id")
  @RequirePermissions("customers.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.customers.get(u.organizationId!, id);
  }

  @Get(":id/account")
  @RequirePermissions("customers.read")
  account(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.customers.account(u.organizationId!, id);
  }

  @Get(":id/insights")
  @RequirePermissions("customers.read")
  insights(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.customers.insights(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("customers.manage")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createCustomerSchema)) b: CreateCustomerInput) {
    return this.customers.create(u.organizationId!, b);
  }

  @Patch(":id")
  @RequirePermissions("customers.manage")
  update(
    @CurrentUser() u: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) b: UpdateCustomerInput
  ) {
    return this.customers.update(u.organizationId!, id, b);
  }
}

@ApiTags("orders")
@Controller("orders")
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly tokens: TrackingTokenService,
    @Inject(ENV) private readonly env: Env
  ) {}

  @Get()
  @RequirePermissions("orders.read")
  list(@CurrentUser() u: AuthContext) {
    return this.orders.list(u.organizationId!);
  }

  // Entregas pendientes para la ruta (antes de :id para no colisionar).
  @Get("pending-deliveries")
  @RequirePermissions("orders.read")
  pendingDeliveries(@CurrentUser() u: AuthContext) {
    return this.orders.pendingDeliveries(u.organizationId!);
  }

  // Headers de servicio para llegar a OSRM detrás de Cloudflare Access
  // (Service Token). undefined si no se configuró → sin auth (dev/local).
  private osrmHeaders(): Record<string, string> | undefined {
    const id = this.env.OSRM_CF_ACCESS_CLIENT_ID;
    const secret = this.env.OSRM_CF_ACCESS_CLIENT_SECRET;
    if (!id || !secret) return undefined;
    return { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret };
  }

  // Ruta óptima global (2-opt) desde la posición del repartidor (lat/lng opcionales).
  @Get("route")
  @RequirePermissions("orders.read")
  route(@CurrentUser() u: AuthContext, @Query("lat") lat?: string, @Query("lng") lng?: string) {
    const la = lat != null ? Number(lat) : NaN;
    const ln = lng != null ? Number(lng) : NaN;
    const start = Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : null;
    return this.orders.optimizeRoute(u.organizationId!, start, this.env.OSRM_URL, this.osrmHeaders());
  }

  @Get(":id")
  @RequirePermissions("orders.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.get(u.organizationId!, id);
  }

  // Token para el link de rastreo que se comparte con el cliente (firmado; no expone
  // datos). El front arma la URL pública /track/<token>.
  @Get(":id/track-token")
  @RequirePermissions("orders.read")
  trackToken(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return { token: this.tokens.sign(u.organizationId!, id) };
  }

  @Post()
  @RequirePermissions("orders.create")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createOrderSchema)) b: CreateOrderInput) {
    return this.orders.create(u.organizationId!, u.userId, b);
  }

  @Post(":id/confirm")
  @RequirePermissions("orders.confirm")
  confirm(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.confirm(u.organizationId!, u.userId, id);
  }

  @Post(":id/fulfill")
  @RequirePermissions("orders.fulfill")
  fulfill(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.fulfill(u.organizationId!, u.userId, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("orders.cancel")
  cancel(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.cancel(u.organizationId!, id);
  }

  @Patch(":id/delivery")
  @RequirePermissions("orders.deliver")
  updateDelivery(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(updateDeliverySchema)) b: UpdateDeliveryInput) {
    return this.orders.updateDelivery(u.organizationId!, id, u.userId, b);
  }
}

@ApiTags("delivery-tracking")
@Controller("delivery")
export class DeliveryController {
  constructor(
    private readonly tracking: DeliveryTrackingService,
    private readonly orders: OrderService,
    private readonly payments: PaymentService
  ) {}

  // El repartidor emite su ubicación (mientras está EN LÍNEA con la Ruta abierta).
  @Post("location")
  @RequirePermissions("orders.deliver")
  async report(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(driverLocationSchema)) b: DriverLocationInput) {
    await this.tracking.report(u.organizationId!, u.userId, b.lat, b.lng);
    return { ok: true };
  }

  // El repartidor se pone FUERA DE LÍNEA: deja de aparecer en el tablero del dueño.
  @Post("offline")
  @RequirePermissions("orders.deliver")
  async offline(@CurrentUser() u: AuthContext) {
    await this.tracking.goOffline(u.organizationId!, u.userId);
    return { ok: true };
  }

  // El dueño ve repartidores en vivo + entregas pendientes.
  @Get("live")
  @RequirePermissions("orders.read")
  async live(@CurrentUser() u: AuthContext) {
    const [drivers, stops] = await Promise.all([
      this.tracking.live(u.organizationId!),
      this.orders.pendingDeliveries(u.organizationId!),
    ]);
    return { drivers, stops };
  }

  // Corte del repartidor: cuánto efectivo de reparto trae sin entregar (por usuario)
  // + a qué turnos abiertos puede entregarlo.
  @Get("cash-summary")
  @RequirePermissions("orders.deliver")
  cashSummary(@CurrentUser() u: AuthContext) {
    return this.payments.driverCashSummary(u.organizationId!, u.userId);
  }

  // Entrega ese efectivo a un turno de caja abierto (entra al arqueo de ese turno).
  @Post("cash-handover")
  @RequirePermissions("payments.record")
  cashHandover(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(cashHandoverSchema)) b: CashHandoverInput) {
    return this.payments.driverCashHandover(u.organizationId!, u.userId, b.cashSessionId);
  }
}

// Rastreo PÚBLICO para el cliente (sin sesión): el token firmado identifica el pedido
// y devolvemos solo lo necesario ("tu pedido va en camino" + repartidor + ETA).
@ApiTags("track")
@Controller("track")
export class TrackController {
  constructor(
    private readonly tokens: TrackingTokenService,
    private readonly tracking: DeliveryTrackingService
  ) {}

  @Public()
  @Get(":token")
  async track(@Param("token") token: string) {
    const decoded = this.tokens.verify(token);
    if (!decoded) throw new NotFoundException("Rastreo no válido");
    const status = await this.tracking.publicOrderStatus(decoded.orgId, decoded.orderId);
    if (!status) throw new NotFoundException("Pedido no encontrado");
    return status;
  }
}
