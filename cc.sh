#!/bin/sh
nodejs job.js gdfg
if [ ! -z "$1" ]
 then mkdir "$1"
fi

