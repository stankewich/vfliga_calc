# Shirt Detection System Analysis

## Date: 2026-02-08

## Summary

Analyzed log file `logs/console-export-2026-2-8_0-35-28.log` to investigate:
1. Tournament type detection caching effectiveness
2. Shirt detection system behavior

## Findings

### 1. Tournament Type Caching - ✅ WORKING

**Problem (Previous):** Tournament type detection was being called ~20 times per page load, parsing entire `document.body.innerHTML` each time.

**Solution Implemented:** Added caching with 1-minute duration:
- Variables: `cachedTournamentType`, `cachedTournamentTypeTime`, `TOURNAMENT_TYPE_CACHE_DURATION`
- First call parses and caches, subsequent calls return cached value

**Result:** Tournament parsing now occurs only **2 times** instead of ~20 times:
```
Line 127: 🔍 Поиск типа турнира в HTML:
Line 472: 🔍 Поиск типа турнира в HTML:
```

**Impact:** Significant performance improvement, reduced log spam.

### 2. Shirt Detection System - ⚠️ NEEDS INVESTIGATION

**Observation:** Only one `[SHIRTS]` log entry found in the entire log:
```
Line 1486: [Shirts] Generated positions
```

**Missing Logs:**
- No `[SHIRTS] Trying selector:` logs (shirt element search)
- No `[SHIRTS] Found GK/field shirt:` logs (shirt URL extraction)
- No `[SHIRTS] No shirt found` logs (fallback to defaults)

**Possible Causes:**
1. **Cache Hit:** Shirts are being loaded from localStorage cache
   - `getCachedShirts()` returns cached data immediately
   - No fresh fetch occurs, so no selector logs
2. **Early Return:** Function returns before reaching detection code
3. **Error:** Silent error prevents logging (unlikely, would see error log)

**Previous Logging Gaps:**
- `getTeamShirts()` had no logging when returning cached shirts
- `initializeShirtsSystem()` had no logging on entry
- No logging of fetched shirt URLs

## Improvements Implemented

### Enhanced Logging in `getTeamShirts()`

```javascript
async function getTeamShirts(teamId) {
    console.log(`[SHIRTS] Getting shirts for team ${teamId}`);

    // Проверяем кэш
    const cached = getCachedShirts(teamId);
    if (cached) {
        console.log(`[SHIRTS] Using cached shirts for team ${teamId}:`, cached);
        return cached;
    }

    console.log(`[SHIRTS] No cache found, fetching fresh shirts for team ${teamId}`);
    
    // ... fetch logic ...
    
    console.log(`[SHIRTS] Found last match for team ${teamId}: day=${lastMatch.day}, matchId=${lastMatch.matchId}`);
    console.log(`[SHIRTS] Fetched shirts for team ${teamId}:`, shirts);
    console.log(`[SHIRTS] Cached shirts for team ${teamId}`);
}
```

### Enhanced Logging in `initializeShirtsSystem()`

```javascript
async function initializeShirtsSystem(homeTeamId, awayTeamId, ...) {
    console.log(`[SHIRTS] Initializing shirts system for home=${homeTeamId}, away=${awayTeamId}`);
    
    // ... load shirts ...
    
    console.log(`[SHIRTS] Successfully loaded shirts:`, { homeShirts, awayShirts });
}
```

## Next Steps

1. **Test with new logging:** Generate a fresh log to see:
   - Are shirts coming from cache?
   - If fetching fresh, do selectors find shirt elements?
   - Are shirt URLs being extracted correctly?

2. **Cache Management:**
   - Check cache expiration (currently 24 hours)
   - Consider adding cache clear button for testing
   - Verify cache keys are correct

3. **DOMParser Investigation:**
   - If selectors fail, verify DOMParser correctly parses style attributes
   - Test alternative innerHTML extraction method
   - Consider using regex on raw HTML as primary method

4. **Shirt URL Validation:**
   - Verify extracted URLs are valid
   - Check if URLs need BASE_URL prefix
   - Test with different shirt formats

## Log Analysis Commands

To analyze shirt detection in logs:
```bash
# Find all SHIRTS logs
grep "\[SHIRTS\]" logs/console-export-*.log

# Find tournament parsing
grep "Поиск типа турнира" logs/console-export-*.log

# Count tournament parsing calls
grep -c "Поиск типа турнира" logs/console-export-*.log
```

## Related Files

- `calc.user.js` (lines 9572-9810): Shirt detection functions
- `calc.user.js` (lines 10545-10610): Shirt system initialization
- `calc.user.js` (lines 8966-9010): Tournament type caching
- `docs/api/SHIRTS_SYSTEM_API.md`: Shirt system documentation

## Commit

```
feat: add comprehensive logging to shirt detection system

- Added detailed logging to getTeamShirts() function
- Added logging to initializeShirtsSystem()
- All shirt logs use [SHIRTS] tag for consistency
```

Branch: `feature/positioning-system`
Commit: `691857e`
