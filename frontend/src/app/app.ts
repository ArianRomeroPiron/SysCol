import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Row = Record<string, any>;
@Component({selector:'app-root', standalone:true, imports:[CommonModule, FormsModule], templateUrl:'./app.html'})
export class App {
  user = signal<Row|null>(null);
  tab = signal('ventas');
  busy = signal(false);
  error = signal('');
  notice = signal('');
  registering = false;
  credentials = {nombre:'', colmado:'', email:'', password:''};
  products = signal<Row[]>([]);
  categories = signal<Row[]>([]);
  customers = signal<Row[]>([]);
  debts = signal<Row[]>([]);
  payments = signal<Row[]>([]);
  employees = signal<Row[]>([]);
  sales = signal<Row[]>([]);
  report = signal<Row|null>(null);
  cart = signal<{id_producto:number; nombre:string; cantidad:number; precio:number}[]>([]);
  total = computed(() => this.cart().reduce((sum,x) => sum + Math.round(x.precio*100)*x.cantidad,0)/100);
  isManager = computed(() => ['dueno','admin'].includes(this.user()?.['rol']));
  product: Row = this.newProduct();
  customer: Row = this.newCustomer();
  employee = {nombre:'',email:'',password:'',rol:'cajero'};
  category = '';
  search = '';
  customerSearch = '';
  async findCustomers() { await this.run(async()=>{this.customers.set(await this.api('/clientes?limit=200&q='+encodeURIComponent(this.customerSearch)));}); }
  offset = 0;
  pageSize = 50;
  customerId: number|null = null;
  method = 'efectivo';
  reference = this.uuid();
  paymentRefs: Record<number,string> = {};
  paymentValues: Record<number,number> = {};
  stockValues: Record<number,number> = {};
  stockReasons: Record<number,string> = {};
  from = this.today();
  to = this.today();
  receipt = signal<Row|null>(null);
  private token = '';

  newProduct(): Row { return {nombre:'',id_categoria:null,codigo_barras:null,precio_compra:0,precio_venta:0,stock_minimo:5,activo:true}; }
  newCustomer(): Row { return {nombre:'',telefono:'+1809',limite_credito:0,consentimiento_whatsapp:false}; }
  today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  uuid(): string { return crypto.randomUUID(); }
  money(value: any) { return new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP'}).format(Number(value||0)); }
  async api(path:string, method='GET', data?:unknown):Promise<any> {
    const headers:Record<string,string> = {};
    if(this.token) headers['Authorization'] = 'Bearer '+this.token;
    if(data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch('/api'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
    if(response.status===401 && this.user()) this.logout();
    const body = await response.json();
    if(!response.ok) throw new Error(typeof body.detail==='string'?body.detail:'Revisa los datos del formulario.');
    return body;
  }
  async run(action:()=>Promise<void>) {
    if(this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await action(); } catch(e) { this.error.set(e instanceof Error?e.message:'No se pudo conectar. Intenta otra vez.'); }
    finally { this.busy.set(false); }
  }
  async login() {
    await this.run(async()=>{
      if(this.registering) await this.api('/auth/register','POST',this.credentials);
      const body = new URLSearchParams({username:this.credentials.email,password:this.credentials.password});
      const response = await fetch('/api/auth/login',{method:'POST',body});
      const result = await response.json();
      if(!response.ok) throw new Error(result.detail || 'No se pudo iniciar sesión');
      this.token=result.access_token;
      this.user.set(await this.api('/auth/me'));
      this.credentials.password='';
      await this.load();
    });
  }
  logout() { this.token=''; this.user.set(null); this.cart.set([]); this.receipt.set(null); this.products.set([]); this.customers.set([]); this.debts.set([]);this.sales.set([]);this.payments.set([]);this.report.set(null);this.employees.set([]);this.categories.set([]);this.product=this.newProduct();this.customer=this.newCustomer();this.employee={nombre:'',email:'',password:'',rol:'cajero'};this.customerId=null;this.paymentValues={};this.paymentRefs={};this.stockValues={};this.stockReasons={};this.reference=this.uuid();this.tab.set('ventas'); }
  async navigate(tab:string) { if(this.busy()) return; this.tab.set(tab);this.offset=0;this.search='';await this.run(()=>this.load()); }
  async load() {
    const query='?offset='+this.offset+'&limit='+this.pageSize;
    switch(this.tab()) {
      case 'ventas': case 'inventario':
        this.products.set(await this.api('/productos'+query+'&q='+encodeURIComponent(this.search)));
        this.categories.set(await this.api('/categorias?limit=200'));
        if(this.tab()==='ventas') this.customers.set(await this.api('/clientes?limit=200'));
        break;
      case 'clientes': this.customers.set(await this.api('/clientes'+query+'&q='+encodeURIComponent(this.customerSearch)));break;
      case 'fiao': this.debts.set(await this.api('/deudas'+query)); this.payments.set(await this.api('/abonos'+query)); this.customers.set(await this.api('/clientes?limit=200'));break;
      case 'historial':this.sales.set(await this.api('/ventas'+query));break;
      case 'reportes':this.report.set(await this.api('/reportes?desde='+this.from+'&hasta='+this.to));break;
      case 'equipo':this.employees.set(await this.api('/auth/usuarios'));break;
    }
  }
  async next(delta:number) { this.offset=Math.max(0,this.offset+delta*this.pageSize);await this.run(()=>this.load()); }
  add(p:Row) {
    if(!p['activo'] || p['stock']<1) return;
    const existing=this.cart().find(x=>x.id_producto===p['id']);
    if(existing && existing.cantidad>=p['stock']) {this.error.set('No hay más existencias disponibles.');return;}
    this.cart.update(rows=>existing?rows.map(x=>x.id_producto===p['id']?{...x,cantidad:x.cantidad+1}:x):[...rows,{id_producto:p['id'],nombre:p['nombre'],cantidad:1,precio:Number(p['precio_venta'])}]);
  }
  remove(id:number) { this.cart.update(rows=>rows.filter(x=>x.id_producto!==id)); }
  async checkout() { await this.run(async()=>{
    if(!this.cart().length) throw new Error('Agrega productos a la venta.');
    if(this.method==='fiao' && !this.customerId) throw new Error('Selecciona el cliente del fiao.');
    const sale=await this.api('/ventas','POST',{referencia:this.reference,id_cliente:this.customerId,metodo_pago:this.method,detalles:this.cart().map(x=>({id_producto:x.id_producto,cantidad:x.cantidad}))});
    this.receipt.set(sale); this.cart.set([]);this.reference=this.uuid();this.notice.set('Venta registrada correctamente.');await this.load();
  }); }
  async saveProduct() { await this.run(async()=>{
    const {id,stock,colmado_id,...data}=this.product;
    await this.api('/productos'+(id?'/'+id:''),id?'PUT':'POST',data);
    this.product=this.newProduct(); await this.load();this.notice.set('Producto guardado.');
  }); }
  async saveCategory() { await this.run(async()=>{await this.api('/categorias','POST',{nombre:this.category});this.category='';await this.load();}); }
  async adjust(p:Row) { await this.run(async()=>{await this.api('/productos/'+p['id']+'/stock','POST',{cantidad:Number(this.stockValues[p['id']]),motivo:this.stockReasons[p['id']]||''});await this.load();this.notice.set('Ajuste registrado.');}); }
  async saveCustomer() { await this.run(async()=>{const {id,saldo,colmado_id,...data}=this.customer;await this.api('/clientes'+(id?'/'+id:''),id?'PUT':'POST',data);this.customer=this.newCustomer();await this.load();this.notice.set('Cliente guardado.');}); }
  customerName(id:number) { return this.customers().find(x=>x['id']===id)?.['nombre'] || 'Cliente #'+id; }
  async pay(d:Row) { await this.run(async()=>{const id=d['id'];this.paymentRefs[id] ||= this.uuid();await this.api('/deudas/'+id+'/abonos','POST',{referencia:this.paymentRefs[id],monto:this.paymentValues[id]});delete this.paymentRefs[id];delete this.paymentValues[id];await this.load();this.notice.set('Abono registrado.');}); }
  async whatsapp(c:Row) { await this.run(async()=>{const result=await this.api('/whatsapp/'+c['id']);this.notice.set(result.mensaje);window.open(result.url,'_blank','noopener,noreferrer');}); }
  async saveEmployee() { await this.run(async()=>{await this.api('/auth/usuarios','POST',this.employee);this.employee={nombre:'',email:'',password:'',rol:'cajero'};await this.load();}); }
  async toggle(e:Row) { await this.run(async()=>{await this.api('/auth/usuarios/'+e['id']+'/estado?activo='+!e['esta_activo'],'PATCH');await this.load();}); }
  print() { window.print(); }
}
