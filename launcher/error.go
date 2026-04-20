package main

// exitWithError logs the error, shows a message to the user, and exits.
func exitWithError(title, message string) {
	logf("ERROR: %s: %s", title, message) // debug
	showError(title, message)
	logLeave("main") // debug
	panic(title + ": " + message)
}
