#!/bin/sh
# Adds a 1 GB swap file (the e2-micro has 1 GB of RAM). Safe to run twice.
set -eu
if swapon --show | grep -q /swapfile; then echo "Swap already on"; exit 0; fi
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
free -m
