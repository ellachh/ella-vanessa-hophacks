#!/usr/bin/env bash
# Seed the food-pickup board with realistic Baltimore listings.
#
# Run from server/:   ./seed.sh
#
# A demo with two markers looks like a prototype. Fifteen spread across real
# neighborhoods looks like a product. That difference is worth 90 seconds.
#
# Donors are invented on purpose — do not use real business names in a public
# demo.
set -euo pipefail

DB="${1:-food-pickup}"

# Timestamp columns are microseconds since the Unix epoch, but the CLI does NOT
# accept a bare integer. `spacetime call` reports the signature as:
#
#   pickup_by: { __timestamp_micros_since_unix_epoch__: i64 }
#
# so the argument must be the wrapped form below. Passing `0` fails with
# "invalid type: integer `0`, expected a 1-element tuple".
now_us=$(( $(date +%s) * 1000000 ))
hour_us=3600000000

# Wrap a micros value as the Timestamp argument the CLI expects.
# If the named form is ever rejected, the positional form '[<micros>]' is the
# documented alternative for a 1-element product type.
ts_arg() { printf '{"__timestamp_micros_since_unix_epoch__": %s}' "$1"; }

# donor | description | hours until pickup deadline | lat | lng
listings=(
  "Pratt Street Bakehouse|About 20 day-old bagels and 6 loaves of sourdough|3|39.2857|-76.6100"
  "Fells Point Grocer|Produce boxes — greens, carrots, apples. Roughly 40 lbs|5|39.2820|-76.5930"
  "Hampden Coffee Collective|Pastries and 2 gallons of oat milk|2|39.3299|-76.6294"
  "Federal Hill Deli|14 wrapped sandwiches, made this morning|2|39.2757|-76.6105"
  "Mount Vernon Catering Co|Event surplus — trays of rice, roasted vegetables, salad|4|39.2976|-76.6157"
  "Canton Fish Market|Fresh fish on ice, must move today. About 25 lbs|2|39.2817|-76.5747"
  "Charles Village Co-op|Bulk dry goods — rice, lentils, pasta. 6 crates|8|39.3260|-76.6157"
  "Station North Pizzeria|18 par-baked pies|3|39.3110|-76.6155"
  "Remington Farm Stand|End-of-market vegetables, mixed. 5 crates|4|39.3200|-76.6280"
  "Locust Point Cafe|Soup in sealed containers, about 6 quarts|3|39.2686|-76.5880"
  "Highlandtown Panaderia|Sweet bread and rolls, roughly 60 pieces|5|39.2887|-76.5658"
  "Pigtown Corner Market|Dairy nearing date — milk, yogurt, cheese|6|39.2838|-76.6355"
  "Bolton Hill Kitchen|Prepared meals in trays, serves about 30|4|39.3050|-76.6220"
  "Patterson Park Concessions|Hot dogs, buns, condiments from a cancelled event|2|39.2894|-76.5790"
  "Roland Park Bistro|Family meal surplus — chicken, potatoes, greens|5|39.3520|-76.6320"
)

echo "Seeding '$DB' with ${#listings[@]} listings..."

for row in "${listings[@]}"; do
  IFS='|' read -r donor description hours lat lng <<< "$row"
  pickup_by=$(( now_us + hours * hour_us ))

  # `--` is REQUIRED: Baltimore longitudes are negative, and without it the CLI
  # parses `-76.6100` as a bundle of short flags and dies with
  # "unexpected argument '-7' found".
  spacetime call -- "$DB" post_listing \
    "\"$donor\"" \
    "\"$description\"" \
    "$(ts_arg "$pickup_by")" \
    "$lat" \
    "$lng"

  echo "  + $donor"
done

echo
echo "Done. Verify:"
echo "  spacetime sql $DB \"SELECT * FROM listing\""
echo
echo "To clear and reseed:"
echo "  spacetime sql $DB \"DELETE FROM listing\"   # then ./seed.sh again"
