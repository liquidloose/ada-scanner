/**
 * Spreadsheet Combination and Deduplication Utility
 * 
 * This script combines multiple Excel files from accessibility test runs into:
 * 1. master-list.xlsx - All violations from all test runs combined
 * 2. work-list.xlsx - Deduplicated list with only unique violations
 * 
 * The deduplication process identifies violations that appear across multiple
 * test runs (same target element and failure summary) and keeps only one instance.
 */

// Excel file manipulation library
import * as XLSX from 'xlsx'
// File system operations
import * as fs from 'fs'
// Path manipulation utilities
import * as path from 'path'
// Additional XLSX imports for specific functions
import { read } from "xlsx"
import { readFileSync } from "fs"

/**
 * Global Data Storage
 * 
 * These variables persist throughout the entire process to accumulate
 * and process data from all spreadsheet files.
 */

// Array to store all violation records from all spreadsheets
let sheetData = []
// Workbook for the master-list.xlsx (all violations, no deduplication)
let wb = XLSX.utils.book_new()
// Workbook for the work-list.xlsx (deduplicated violations only)
let finalBook = XLSX.utils.book_new()

/**
 * Append Data from Individual Spreadsheet
 * 
 * Reads an Excel file and adds its violation data to the global sheetData array.
 * When processing the last file, generates the master-list.xlsx containing
 * all violations from all test runs (no deduplication at this stage).
 * 
 * @param {string} filePath - Full path to the Excel file to process
 * @param {boolean} lastIndex - True if this is the last file in the directory
 * 
 * Process Flow:
 * 1. Read Excel file from disk
 * 2. Extract violation data from the first sheet
 * 3. Append all violations to the global sheetData array
 * 4. If this is the last file, generate master-list.xlsx
 */
const appendDataToSheet = async (filePath, lastIndex) => {

    // Read the Excel file as a binary buffer from the file system
    const buffer = readFileSync(filePath)
    // Parse the buffer into a workbook object
    let workbook = read(buffer)

    // Get the first (and typically only) sheet name from the workbook
    const sheetName = workbook.SheetNames[0]
    // Access the actual sheet data using the sheet name
    const sheet = workbook.Sheets[sheetName]

    // Convert the Excel sheet into a JSON array of objects
    // Each row becomes an object with column headers as keys
    const currentData = XLSX.utils.sheet_to_json(sheet)

    // Use spread operator to append all rows from this file to the global array
    // This combines data from multiple files into one master dataset
    sheetData.push(...currentData)

    // Convert the accumulated JSON data back into Excel worksheet format
    const ws = XLSX.utils.json_to_sheet(sheetData)

    // Check if this is the last file to process
    // This ensures master-list.xlsx is only created once with all data
    if (lastIndex === true) {

        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(wb, ws)
        // Write the complete master list to disk (contains ALL violations including duplicates)
        XLSX.writeFile(wb, "./spreadsheets/master-list.xlsx")

    }
}

/**
 * MAIN EXECUTION: Process All Spreadsheets
 * 
 * This is the entry point that orchestrates the entire combination and
 * deduplication process. It runs in several stages:
 * 
 * Stage 1: File Discovery and Data Aggregation
 * Stage 2: Duplicate Detection
 * Stage 3: Duplicate Removal
 * Stage 4: Final Output Generation
 */

// Target directory containing all individual test result spreadsheets
const directoryPath = './spreadsheets/'

/**
 * Stage 1: File Discovery and Data Aggregation
 * 
 * Read all files in the spreadsheets directory and combine them into
 * a single dataset stored in the global sheetData array.
 */
fs.readdir(directoryPath, (err, files) => {
    // Store the index of the last file to trigger master-list.xlsx generation
    let lastIndex = files.length - 1

    // Handle any errors reading the directory
    if (err) {
        console.error('Error reading directory:', err)
        return
    }

    /**
     * Process Each File in the Directory
     * 
     * Iterate through all files, filtering for .xlsx files and processing each one
     * to combine their violation data into the global sheetData array.
     */
    files.forEach((file, index) => {

        // Convert lastIndex to boolean true when we reach the final file
        lastIndex = (lastIndex === index) ? true : lastIndex
        
        // Only process Excel files (skip master-list.xlsx and work-list.xlsx if they exist)
        if (path.extname(file) === '.xlsx') {
            // Build the complete file path
            const filePath = path.join(directoryPath, file)
            // Read and append this file's data to the global sheetData array
            appendDataToSheet(filePath, lastIndex)
        }
    })

    /**
     * Stage 2: Duplicate Detection
     * 
     * Identify duplicate violations across all test runs using a nested loop comparison.
     * Two violations are considered duplicates if they have:
     * 1. Same target (CSS selector of the problematic element)
     * 2. Same failureSummary (description of what's wrong)
     * 
     * The algorithm uses a nested loop approach:
     * - Outer loop: Iterates through each violation in sheetData
     * - Inner loop: Compares the current outer violation with all violations that come AFTER it
     * 
     * This approach ensures:
     * - Each pair is compared only once (not twice)
     * - The FIRST occurrence is kept, later duplicates are marked for deletion
     * - No item is compared with itself
     */
    
    // Array to store the indices of duplicate violations to be removed
    const indicesToDelete = []
    console.log('sheetData', sheetData)

    /**
     * Outer Loop: Select Each Violation as the "Reference"
     * 
     * For each violation, we'll compare it against all violations that come after it
     * in the array to find duplicates.
     */
    sheetData.forEach((outerElement, outerIndex) => {
        
        /**
         * Inner Loop: Compare Reference Against All Subsequent Violations
         * 
         * For the current outer violation, check every violation that appears
         * later in the array to see if it's a duplicate.
         */
        sheetData.forEach((innerElement, innerIndex) => {
            
            /**
             * Forward-Only Comparison
             * 
             * Only check items that come AFTER the current item (innerIndex > outerIndex).
             * This prevents:
             * - Comparing an item with itself (innerIndex === outerIndex)
             * - Marking both duplicates for deletion (already checked when inner was outer)
             * 
             * Result: Keeps the first occurrence, marks later duplicates for deletion
             */
            if (innerIndex > outerIndex) {

                /**
                 * Duplicate Detection Logic
                 * 
                 * Check if both violations have:
                 * 1. Same target element (where the violation occurs)
                 * 2. Same failure summary (what the violation is)
                 * 
                 * If both match, they're considered duplicates and the later one
                 * (innerIndex) is marked for deletion.
                 */
                if (outerElement.target === innerElement.target) {
                    if (outerElement.failureSummary === innerElement.failureSummary) {
                        console.log('Duplicate found, adding to indicesToDelete:', innerIndex)
                        console.log('outerElement', outerElement)
                        console.log('innerElement', innerElement)
                        // Mark this duplicate's index for removal
                        indicesToDelete.push(innerIndex)
                    }
                }
            }
        })
    })

    /**
     * Stage 3: Duplicate Removal Preparation
     * 
     * The indicesToDelete array may contain duplicate indices (the same violation
     * marked multiple times if it appears 3+ times in the dataset). We need to
     * remove these duplicate indices before deleting violations.
     * 
     * Substage 3A: Remove Duplicate Indices
     */
    
    // Use a Set to track which indices we've already seen
    const seen = new Set()

    /**
     * Filter Duplicate Indices
     * 
     * Create a uniqueArray containing each index only once, even if a violation
     * was marked for deletion multiple times (happens when 3+ identical violations exist).
     * 
     * Example: If indices [5, 10, 10, 15] are marked, this reduces to [5, 10, 15]
     */
    const uniqueArray = indicesToDelete.filter((element) => {
        if (seen.has(element)) {
            // Already processed this index, filter it out
            return false
        } else {
            // First time seeing this index, keep it and mark as seen
            seen.add(element)
            return true
        }
    })

    /**
     * Substage 3B: Sort for Safe Deletion
     * 
     * Sort indices in descending order (highest to lowest).
     * This is CRITICAL because:
     * - Removing item at index 5 shifts all items after it down by 1
     * - If we remove lowest indices first, higher indices become invalid
     * - Removing highest indices first keeps lower indices stable
     * 
     * Example:
     * Array: [A, B, C, D, E] with indices [1, 3] to delete
     * Wrong order (ascending):
     *   1. Delete index 1 → [A, C, D, E] (index 3 is now index 2!)
     *   2. Delete index 3 → Deletes wrong item (E instead of D)
     * Correct order (descending):
     *   1. Delete index 3 → [A, B, C, E]
     *   2. Delete index 1 → [A, C, E] ✓
     */
    indicesToDelete.sort((a, b) => b - a)
    uniqueArray.sort((a, b) => b - a)
    
    /**
     * Execute Deletion
     * 
     * Remove each duplicate violation from the sheetData array.
     * Process in descending index order to maintain array integrity.
     */
    uniqueArray.forEach((element, index) => {
        console.log('Deleting duplicate at index:', element)
        // Remove 1 item at the specified index
        sheetData.splice(element, 1)
    })

    /**
     * Stage 4: Generate Deduplicated Output
     * 
     * Create the work-list.xlsx file containing only unique violations.
     * This is the actionable list for developers to fix accessibility issues,
     * without the noise of duplicate reports from multiple test runs or the same template.
     */
    
    // Convert the deduplicated JSON data to Excel worksheet format
    const workList = XLSX.utils.json_to_sheet(sheetData)

    // Add the worksheet to the final workbook
    XLSX.utils.book_append_sheet(finalBook, workList)
    
    // Write the deduplicated work list to disk
    XLSX.writeFile(finalBook, "./spreadsheets/work-list.xlsx")
    
    console.log('✅ Processing complete!')
    console.log(`📊 Master list: All ${sheetData.length} violations (including duplicates)`)
    console.log(`📋 Work list: ${sheetData.length} unique violations after deduplication`)

})

