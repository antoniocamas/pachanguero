# What each viewer sees of a Bizum payment

`not yet run`: worked by hand from UC-006-07 for the implementation to verify. The copy is Spanish as the app's. A player's view carries the method only; the server leaves the rest out of the response (`OwnDisclosure`).

Situation: on 2026-10-12 the system settled one share (4.00 EUR) of "Luis Pérez" for the game of 2026-10-07 from a Bizum of 4.50 EUR from `Luis P.R.` with the subject `pachanga`, after the organiser ruled that it pays 1 share (UC-006-05-S2).

## Organiser (admin), payment detail

| Campo | Valor |
| ----- | ----- |
| Partido | 07/10/2026 |
| Importe | 4,00 € |
| Fecha de pago | 12/10/2026 |
| Método | Bizum |
| Resuelto | Por decisión del organizador |
| Bizum: fecha | 12/10/2026 |
| Bizum: remitente | Luis P.R. |
| Bizum: importe | 4,50 € |
| Bizum: asunto | pachanga |
| Bizum: identificación del banco | (the bank's own identification of the entry) |
| Bizum: sin asignar | 0,50 € |

## Organiser, payment recorded by hand with the method "Bizum"

| Campo | Valor |
| ----- | ----- |
| Importe | 4,00 € |
| Método | Bizum |
| Resuelto | Registrado a mano |

No Bizum fields appear.

## Player ("Luis Pérez", "Pagos" or "Ver como jugador")

| Partido | Importe | Método |
| ------- | ------- | ------ |
| 07/10/2026 | 4,00 € | Bizum |

No date of the Bizum, sender, subject, identification or amount not allocated.
