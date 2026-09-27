/**
 * Lectores de la tasa del BCV (F3-04), sin internet: lo que devuelven las fuentes, copiado de sus
 * respuestas reales del 2026-09-26, y lo que debe pasar cuando cambian o mienten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarBcv, analizarDolarApi } from "./fuentes.ts";

const BCV = `
<div id="dolar" class="col-sm-12 col-xs-12 ">
	<div class="field-content">
  		<div class="row recuadrotsmc">
			<div class="col-sm-6 col-xs-6">
  			<img src="/sites/default/files/dollar-04_2.png" class="icono_bss_blanco1"> <span> USD</span>	 </div>
        <div class="col-sm-6 col-xs-6 centrado textp"> <strong class="strong-tb">857,00580000</strong>  </div>
	        </div>
        </div>
</div>
          <div class="pull-right dinpro center">
Fecha Valor: <span class="date-display-single" property="dc:date" datatype="xsd:dateTime" content="2026-09-28T00:00:00-04:00">Lunes, 28 Septiembre  2026</span>
<hr>`;

const DOLARAPI = `{"moneda":"USD","fuente":"oficial","nombre":"Dólar","compra":null,"venta":null,"promedio":855.6625,"fechaActualizacion":"2026-09-25T00:00:00-04:00"}`;

test("del BCV: el valor con todos sus decimales, en punto, y la fecha valor", () => {
  const r = analizarBcv(BCV);
  assert.ok(r.ok);
  assert.equal(r.lectura.value, "857.00580000");
  assert.equal(r.lectura.effectiveDate, "2026-09-28");
  assert.equal(r.lectura.crudo["valor"], "857,00580000");
});

test("de DolarApi: el número tal como vino en el texto, sin pasar por un flotante", () => {
  const r = analizarDolarApi(DOLARAPI);
  assert.ok(r.ok);
  assert.equal(r.lectura.value, "855.6625");
  assert.equal(r.lectura.effectiveDate, "2026-09-25");
});

test("si el BCV cambia su página, se dice y no se inventa un valor", () => {
  const sinValor = analizarBcv("<html><body>En mantenimiento</body></html>");
  assert.equal(sinValor.ok, false);
  const sinFecha = analizarBcv(BCV.replace(/Fecha Valor:[\s\S]*/, ""));
  assert.equal(sinFecha.ok, false);
});

test("una fuente que publica cero o basura no da una tasa", () => {
  assert.equal(analizarBcv(BCV.replace("857,00580000", "0,00")).ok, false);
  assert.equal(analizarDolarApi(DOLARAPI.replace("855.6625", "0")).ok, false);
  assert.equal(analizarDolarApi(`{"promedio":"mucho","fechaActualizacion":"2026-09-25T00:00:00-04:00"}`).ok, false);
});
