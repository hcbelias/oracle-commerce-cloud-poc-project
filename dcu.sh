#!/bin/bash

if [ -z $1 ]; then
	echo "./dcu.sh [pass] [extra options]"
	exit 1
fi 

dcu -n https://ccadmin-zaja.oracleoutsourcing.com -u helias@avenuecode.com -b . -p $*
