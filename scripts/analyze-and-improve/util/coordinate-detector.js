import {WIKIDATA_BEST} from "../manual-wikidata-best.js";
import {convertToDecimal, getDistanceFromLatLonInKm} from "./coordinatesConverter.js";
import {UNLOCODE_BEST} from "../manual-unlocode-best.js";
import {downloadByCityIfNeeded} from "./nominatim-downloader.js";
import {readNominatimDataByCity} from "./nominatim-loader.js";

export async function detectCoordinates(entry, nominatimData, wikiDataEntry, maxDistance) {
    const unlocode = entry.unlocode
    const decimalCoordinates = convertToDecimal(entry.coordinates)

    if (WIKIDATA_BEST.includes(unlocode) || (!nominatimData && wikiDataEntry)) {
        return {...wikiDataEntry, type: "Wikidata"}
    }

    if (!nominatimData || UNLOCODE_BEST.includes(unlocode)) {
        // When Nominatim can't find it, which most likely means a non-standard name is found.
        // For example ITMND which has the name "Mondello, Palermo" or ITAQW with the name "Acconia Di Curinga"
        // These should be called "Mondello" and "Acconia" to be found in nominatim.

        // Return the UN/LOCODE entry, regardless of whether it has coordinates or not
        return getUnlocodeResult(entry, decimalCoordinates)
    }

    const nominatimResult = nominatimData.result
    const firstNominatimResult = nominatimResult[0]
    if (entry.coordinates) {
        const distance = Math.round(getDistanceFromLatLonInKm(decimalCoordinates.lat, decimalCoordinates.lon, firstNominatimResult.lat, firstNominatimResult.lon));
        if (distance < maxDistance) {
            // The first result is close enough.
            return getUnlocodeResult(entry, decimalCoordinates, firstNominatimResult)
        }

        // Check if there's another result than the first one who is close. If yes, return that
        const closeResult =  await findCloseResult(maxDistance, nominatimResult, decimalCoordinates, entry, nominatimData, unlocode);
        if (closeResult) {
            return {...closeResult, type: "Nominatim"}
        }
    }

    // No overrides encountered, no results found close to the unlocode coordinates
    let alternatives = undefined
    if (nominatimResult.length > 1 || wikiDataEntry) {
        alternatives = []
        // TODO: combine with WikiData entry when they have the same unlocode coordinates
        alternatives.push(...nominatimResult.slice(1))
        if (wikiDataEntry) {
            alternatives.push(wikiDataEntry)
        }
    }
    return {...firstNominatimResult, type: "Nominatim", alternatives}
}

async function findCloseResult(maxDistance, nominatimResult, decimalCoordinates, entry, nominatimData, unlocode) {
    // Use at max 25 km distance, because it's not the first result, so it has to be close to compensate for that
    const closeDistance = Math.min(25, maxDistance);
    const closeResults = nominatimResult.filter(n => {
        return getDistanceFromLatLonInKm(decimalCoordinates.lat, decimalCoordinates.lon, n.lat, n.lon) < closeDistance
    })
    if (closeResults.length !== 0) {
        // The first hit isn't close, but there is another one who is. Keep UN/LOCODE
        return getUnlocodeResult(entry, decimalCoordinates, closeResults[0])
    }

    const scrapeType = nominatimData.scrapeType
    if (scrapeType === "byRegion") {
        // We couldn't find any close result by region. Let's scrape by city as well to see if there is a location in another region where the coordinates do match (like ITAN2)
        // This means that either the coordinates are wrong, or the region is wrong.
        await downloadByCityIfNeeded(entry)
        const nominatimDataByCity = readNominatimDataByCity(unlocode)?.result
        const closeResults = nominatimDataByCity?.filter(n => {
            return getDistanceFromLatLonInKm(decimalCoordinates.lat, decimalCoordinates.lon, n.lat, n.lon) < closeDistance
        })
        if (closeResults !== undefined && closeResults.length !== 0) {
            return getUnlocodeResult(entry, decimalCoordinates, closeResults[0])
        }
    }
    return undefined
}

function getUnlocodeResult(entry, decimalCoordinates, source) {
    if (!decimalCoordinates) {
        return undefined
    }
    return {...entry, decimalCoordinates, type: "UN/LOCODE", source}
}